"""API keys in SQLite. A key is "<id>.<code>": the id is a cuid2 and the code a random secret, of which only the
SHA-256 hash is stored. The code is 256 bits of randomness, so a fast hash is enough (no password stretching).

usage (on the VM):
  sudo docker compose exec api python3 -m app.keys create "team"     # prints the key ONCE
  sudo docker compose exec api python3 -m app.keys list
  sudo docker compose exec api python3 -m app.keys revoke <id>
"""

import hashlib
import hmac
import os
import secrets
import sqlite3
import sys
import time

from cuid2 import cuid_wrapper

DB_PATH = os.getenv("KEYS_DB", "/app/keys/keys.db")
TOUCH_EVERY_S = 60  # last_used_at is refreshed at most once a minute per key
new_id = cuid_wrapper()


def _db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS api_key (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            code_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            last_used_at INTEGER,
            revoked_at INTEGER
        )"""
    )
    return conn


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def create(name: str) -> str:
    """Returns the full key. It is not stored anywhere and cannot be shown again."""
    key_id, code = new_id(), secrets.token_urlsafe(32)
    with _db() as conn:
        conn.execute(
            "INSERT INTO api_key (id, name, code_hash, created_at) VALUES (?, ?, ?, ?)",
            (key_id, name, _hash(code), int(time.time())),
        )
    return f"{key_id}.{code}"


def verify(key: str) -> str | None:
    """The key's id if it is valid and not revoked, else None."""
    key_id, _, code = key.partition(".")
    if not key_id or not code:
        return None

    with _db() as conn:
        row = conn.execute(
            "SELECT code_hash, last_used_at FROM api_key WHERE id = ? AND revoked_at IS NULL", (key_id,)
        ).fetchone()
        if not row or not hmac.compare_digest(row[0], _hash(code)):
            return None
        now = int(time.time())
        if not row[1] or now - row[1] >= TOUCH_EVERY_S:
            conn.execute("UPDATE api_key SET last_used_at = ? WHERE id = ?", (now, key_id))
    return key_id


def revoke(key_id: str) -> bool:
    with _db() as conn:
        cur = conn.execute("UPDATE api_key SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", (int(time.time()), key_id))
    return cur.rowcount == 1


def rows() -> list[tuple]:
    with _db() as conn:
        return conn.execute("SELECT id, name, created_at, last_used_at, revoked_at FROM api_key ORDER BY created_at").fetchall()


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)

    when = lambda t: time.strftime("%Y-%m-%d %H:%M", time.gmtime(t)) if t else "-"
    if args[0] == "create" and len(args) == 2:
        print(create(args[1]))
        return
    if args[0] == "list":
        for key_id, name, created, used, revoked in rows():
            print(f"{key_id}  {name:20} created {when(created)}  last used {when(used)}  {'REVOKED ' + when(revoked) if revoked else 'active'}")
        return
    if args[0] == "revoke" and len(args) == 2:
        sys.exit(0 if revoke(args[1]) else "no such active key")
    sys.exit(__doc__)


if __name__ == "__main__":
    main()
