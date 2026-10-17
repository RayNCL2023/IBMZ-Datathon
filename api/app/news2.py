"""NEWS2 (Royal College of Physicians, 2017) computed from PhysioNet columns.

Caveats (state these in the pitch):
- Consciousness (AVPU) is not recorded, so we assume "Alert" (0 points).
- Supplemental oxygen is approximated as FiO2 > 0.21.
"""

from math import isnan

URGENT = 5
EMERGENCY = 7


def _missing(v):
    return v is None or (isinstance(v, float) and isnan(v))


def _resp(v):
    if v <= 8:
        return 3
    if v <= 11:
        return 1
    if v <= 20:
        return 0
    if v <= 24:
        return 2
    return 3


def _spo2(v):
    if v <= 91:
        return 3
    if v <= 93:
        return 2
    if v <= 95:
        return 1
    return 0


def _sbp(v):
    if v <= 90:
        return 3
    if v <= 100:
        return 2
    if v <= 110:
        return 1
    if v <= 219:
        return 0
    return 3


def _pulse(v):
    if v <= 40:
        return 3
    if v <= 50:
        return 1
    if v <= 90:
        return 0
    if v <= 110:
        return 1
    if v <= 130:
        return 2
    return 3


def _temp(v):
    if v <= 35.0:
        return 3
    if v <= 36.0:
        return 1
    if v <= 38.0:
        return 0
    if v <= 39.0:
        return 1
    return 2


PARAMS = {
    "Resp": _resp,
    "O2Sat": _spo2,
    "SBP": _sbp,
    "HR": _pulse,
    "Temp": _temp,
}


def components(row: dict) -> dict:
    """Per-parameter NEWS2 points. Missing vitals score 0 (forward-fill upstream)."""
    out = {}
    for name, fn in PARAMS.items():
        v = row.get(name)
        out[name] = 0 if _missing(v) else fn(float(v))

    fio2 = row.get("FiO2")
    out["Oxygen"] = 0 if _missing(fio2) or float(fio2) <= 0.21 else 2
    return out


def score(row: dict) -> tuple[int, bool]:
    """Return (aggregate score, alert). Alert = aggregate >= 5 or any single parameter = 3."""
    parts = components(row)
    total = sum(parts.values())
    return total, total >= URGENT or max(parts.values()) == 3
