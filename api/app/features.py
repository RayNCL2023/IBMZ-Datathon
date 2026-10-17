"""Feature engineering shared by training (ml/) and serving (this API). Numpy only, so it runs on s390x.

A patient is a [T, len(RAW)] float array of raw hourly rows (NaN = not measured).
patient_features() returns [T, len(NAMES)]: row t only uses hours 0..t, so there is no look-ahead.
"""

import warnings

import numpy as np

RAW = [
    "HR", "O2Sat", "Temp", "SBP", "MAP", "DBP", "Resp", "EtCO2",
    "BaseExcess", "HCO3", "FiO2", "pH", "PaCO2", "SaO2", "AST", "BUN", "Alkalinephos", "Calcium",
    "Chloride", "Creatinine", "Bilirubin_direct", "Glucose", "Lactate", "Magnesium", "Phosphate",
    "Potassium", "Bilirubin_total", "TroponinI", "Hct", "Hgb", "PTT", "WBC", "Fibrinogen", "Platelets",
    "Age", "Gender", "Unit1", "Unit2", "HospAdmTime", "ICULOS",
]
MEASURED = RAW[:34]
VITALS = ["HR", "O2Sat", "Temp", "SBP", "MAP", "DBP", "Resp"]
WINDOW = 6

_I = {name: i for i, name in enumerate(RAW)}

NAMES = (
    RAW
    + [f"{v}_hours_since" for v in MEASURED]
    + [f"{v}_{s}{WINDOW}h" for v in VITALS for s in ("mean", "min", "max", "delta")]
    + ["ShockIndex", "BUN_Creatinine", "NEWS2", "qSOFA_partial", "n_measured"]
)


def _ffill(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Forward-fill along time. Also returns the index of the last real measurement (-1 = never)."""
    t = np.arange(x.shape[0])[:, None]
    last = np.maximum.accumulate(np.where(np.isnan(x), -1, t), axis=0)
    filled = np.take_along_axis(x, np.maximum(last, 0), axis=0)
    filled[last < 0] = np.nan
    return filled, last


def _band(v: np.ndarray, edges: list[float], points: list[int]) -> np.ndarray:
    """NEWS2 points: points[i] when v <= edges[i], points[-1] above the last edge, 0 when missing."""
    out = np.full(v.shape, points[-1], dtype=float)
    for edge, p in reversed(list(zip(edges, points))):
        out[v <= edge] = p
    out[np.isnan(v)] = 0
    return out


def news2_vector(ff: np.ndarray) -> np.ndarray:
    """Vectorised NEWS2 aggregate; must match app.news2.score."""
    col = lambda name: ff[:, _I[name]]
    fio2 = col("FiO2")
    return (
        _band(col("Resp"), [8, 11, 20, 24], [3, 1, 0, 2, 3])
        + _band(col("O2Sat"), [91, 93, 95], [3, 2, 1, 0])
        + _band(col("SBP"), [90, 100, 110, 219], [3, 2, 1, 0, 3])
        + _band(col("HR"), [40, 50, 90, 110, 130], [3, 1, 0, 1, 2, 3])
        + _band(col("Temp"), [35.0, 36.0, 38.0, 39.0], [3, 1, 0, 1, 2])
        + np.where(fio2 > 0.21, 2, 0)
    )


def patient_features(raw: np.ndarray) -> np.ndarray:
    raw = np.asarray(raw, dtype=float)
    T = raw.shape[0]
    ff, last = _ffill(raw)

    m = len(MEASURED)
    hours_since = np.arange(T)[:, None] - last[:, :m]
    hours_since = np.where(last[:, :m] < 0, -1, hours_since)

    vit_idx = [_I[v] for v in VITALS]
    vit = ff[:, vit_idx]
    padded = np.vstack([np.full((WINDOW - 1, len(VITALS)), np.nan), vit])
    win = np.lib.stride_tricks.sliding_window_view(padded, WINDOW, axis=0)  # [T, V, W]
    with np.errstate(all="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN windows
        mean, lo, hi = np.nanmean(win, axis=2), np.nanmin(win, axis=2), np.nanmax(win, axis=2)
    delta = vit - win[:, :, 0]
    rolling = np.stack([mean, lo, hi, delta], axis=2).reshape(T, -1)  # matches NAMES order

    with np.errstate(all="ignore"):
        shock = ff[:, _I["HR"]] / ff[:, _I["SBP"]]
        bun_cr = ff[:, _I["BUN"]] / ff[:, _I["Creatinine"]]
    qsofa = (ff[:, _I["Resp"]] >= 22).astype(float) + (ff[:, _I["SBP"]] <= 100).astype(float)
    n_measured = np.cumsum(~np.isnan(raw[:, :m]), axis=0).sum(axis=1)

    derived = np.column_stack([shock, bun_cr, news2_vector(ff), qsofa, n_measured])
    out = np.hstack([ff, hours_since, rolling, derived])
    out[~np.isfinite(out)] = np.nan
    return out


def rows_to_raw(rows: list[dict]) -> np.ndarray:
    return np.array([[np.nan if r.get(k) is None else float(r[k]) for k in RAW] for r in rows], dtype=float)

