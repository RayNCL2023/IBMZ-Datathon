"""Risk labels derived from raw (not forward-filled) hourly data.

Each future-event label answers "does the event first happen within the next H hours?":
  1 for rows in [onset - H, onset), 0 for earlier rows, -1 (not trained on) from onset onwards.
Patients who never have the event are 0 throughout. Rows of a dataset that lacks the signal are -1.
Only the first event counts, so the model predicts new deteriorations, not ongoing ones.
"""

import numpy as np

HORIZON = {"hypotension": 6, "aki": 24, "resp": 6}


def _first(event: np.ndarray) -> int | None:
    hits = np.flatnonzero(event)
    return int(hits[0]) if len(hits) else None


def future_event(event: np.ndarray, horizon: int) -> np.ndarray:
    y = np.zeros(len(event), dtype=np.int8)
    onset = _first(event)
    if onset is None:
        return y

    y[max(0, onset - horizon) : onset] = 1
    y[onset:] = -1
    return y


def _two_low_hours(v: np.ndarray, limit: float) -> np.ndarray:
    """Measured below `limit` in this hour and the previous one."""
    low = v < limit  # NaN compares False
    return low & np.concatenate([[False], low[:-1]])


def hypotension(map_: np.ndarray) -> np.ndarray:
    """Hypotension: MAP < 65 mmHg for two consecutive measured hours."""
    return future_event(_two_low_hours(map_, 65), HORIZON["hypotension"])


def aki(creatinine: np.ndarray) -> np.ndarray:
    """KDIGO creatinine criteria: +0.3 mg/dL within 48h, or >= 1.5x the lowest earlier value."""
    event = np.zeros(len(creatinine), dtype=bool)
    hours = np.flatnonzero(~np.isnan(creatinine))
    for i, t in enumerate(hours[1:], start=1):
        earlier = hours[:i]
        recent = earlier[earlier >= t - 48]
        cr = creatinine[t]
        if len(recent) and cr - creatinine[recent].min() >= 0.3:
            event[t] = True
        if cr >= 1.5 * creatinine[earlier].min():
            event[t] = True
    return future_event(event, HORIZON["aki"])


def resp(spo2: np.ndarray, fio2: np.ndarray) -> np.ndarray:
    """Respiratory deterioration: SpO2 < 90% for two measured hours, or FiO2 up >= 0.2 within 12h."""
    event = _two_low_hours(spo2, 90)
    for t in np.flatnonzero(~np.isnan(fio2)):
        prior = fio2[max(0, t - 12) : t]
        if np.any(~np.isnan(prior)) and fio2[t] - np.nanmin(prior) >= 0.2:
            event[t] = True
    return future_event(event, HORIZON["resp"])
