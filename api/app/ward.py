"""Demo ward: replays real PhysioNet patients hour by hour."""

import csv
import glob
import os
import random

VITALS = ["HR", "O2Sat", "Temp", "SBP", "MAP", "DBP", "Resp", "EtCO2"]

DATA_DIR = os.getenv("DATA_DIR", "/data")
BEDS = int(os.getenv("WARD_BEDS", "12"))
SEED = int(os.getenv("WARD_SEED", "2026"))


def _num(v):
    if v in ("", "NaN", "nan"):
        return None
    return float(v)


def load_patient(path: str) -> list[dict]:
    """Rows as dicts, numeric, with every column forward-filled within the patient."""
    with open(path) as fh:
        reader = csv.DictReader(fh, delimiter="|")
        rows, last = [], {}
        for raw in reader:
            row = {k: _num(v) for k, v in raw.items()}
            for k, v in row.items():
                if v is None:
                    row[k] = last.get(k)
                    continue
                last[k] = v
            rows.append(row)
    return rows


def _pick_patients() -> list[str]:
    """Half septic, half not, from both hospitals, deterministic. Septic patients need >= 24h of stay."""
    files = sorted(glob.glob(os.path.join(DATA_DIR, "*", "*.psv")))
    if not files:
        return []

    rng = random.Random(SEED)
    rng.shuffle(files)
    septic, other = [], []
    for f in files:
        if len(septic) >= BEDS // 2 and len(other) >= BEDS - BEDS // 2:
            break

        with open(f) as fh:
            lines = fh.read().splitlines()[1:]
        labels = [line.rsplit("|", 1)[-1] for line in lines]
        if "1" in labels and labels.index("1") >= 24 and len(septic) < BEDS // 2:
            septic.append(f)
            continue
        if "1" not in labels and len(lines) >= 36 and len(other) < BEDS - BEDS // 2:
            other.append(f)

    picked = septic + other
    rng.shuffle(picked)
    return picked


class Ward:
    def __init__(self):
        self.patients = []
        for path in _pick_patients():
            hospital = "A" if "setA" in path else "B"
            pid = os.path.splitext(os.path.basename(path))[0]
            self.patients.append({"id": pid, "hospital": hospital, "rows": load_patient(path)})

    def at(self, hour: int) -> list[dict]:
        beds = []
        for i, p in enumerate(self.patients):
            rows = p["rows"]
            h = min(hour, len(rows) - 1)
            row = rows[h]
            beds.append({
                "bed": i + 1,
                "patientId": p["id"],
                "hospital": p["hospital"],
                "hour": h,
                "lengthOfStay": len(rows),
                "discharged": hour >= len(rows),
                "row": row,
                "vitals": {k: row.get(k) for k in VITALS},
                "label": int(row.get("SepsisLabel") or 0),
            })
        return beds
