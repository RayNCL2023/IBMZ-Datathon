"""Alert fatigue and headline numbers for the exported heads, on held-out test patients (no retraining).

usage: .venv/bin/python fatigue.py
writes ../api/model/fatigue.json (served by GET /fatigue) and adds "headline" to ../api/model/metrics.json

- alertsPerBedDay: alarms that *start* (not every alarming hour) per bed per 24h, counted up to each
  patient's first event (afterwards the patient is already being treated for it).
- alarmHours: share of bed-hours spent alarming (same denominator), which doesn't reward alarms that stay on.
- caught: share of patients with the event who got an alarm in the warning window before it.
- fairness: the deployed alarm vs NEWS2 >= 5 per age band and sex (groups with >= 20 event patients).
- sepsisUtility: the official PhysioNet/CinC 2019 normalised utility (1 = perfect, 0 = never alarm), threshold
  chosen on validation patients, scored on test patients.
"""

import json
import os

import numpy as np
import xgboost as xgb
from sklearn.metrics import roc_auc_score

from train import DST, NEWS2, SITES, TARGETS, TRAIN_SITES, HERE, features, split_patients

AGE_BANDS = [(0, 50), (50, 65), (65, 80), (80, 200)]
LEVELS = np.geomspace(0.002, 0.5, 40)  # alarming-row shares to sweep the model threshold over


def windows(y, pid, hour, target):
    """(rows that count towards alarm load, rows inside the warning window). Sepsis labels start 6h before
    clinical onset and stay 1 afterwards, so its window is [label start, label start + 6)."""
    if target != "sepsis":
        return y >= 0, y == 1
    start = np.full(pid.max() + 1, np.iinfo(np.int32).max)
    np.minimum.at(start, pid[y == 1], hour[y == 1])
    onset = start[pid] + 6
    return (y >= 0) & (hour < onset), (y == 1) & (hour < onset)


def load_and_catch(alert, pid, load, window):
    """alertsPerBedDay and caught for one boolean alert vector (rows sorted by patient, then hour)."""
    a = alert & load
    starts = a & ~np.r_[False, a[:-1] & (pid[1:] == pid[:-1])]
    per_day = starts.sum() / max(load.sum(), 1) * 24
    events = np.unique(pid[window])
    caught = np.unique(pid[window & alert])
    hours = a.sum() / max(load.sum(), 1)
    return round(float(per_day), 4), round(len(caught) / max(len(events), 1), 4), round(float(hours), 4)


def curve(score, thresholds, pid, load, window, key):
    pts = []
    for t in thresholds:
        per_day, caught, hours = load_and_catch(score >= t, pid, load, window)
        pts.append({key: round(float(t), 4), "alertsPerBedDay": per_day, "alarmHours": hours, "caught": caught})
    return sorted(pts, key=lambda p: p["alertsPerBedDay"])


def at(points, x_key, x, y_key):
    xs, ys = [p[x_key] for p in points], [p[y_key] for p in points]
    order = np.argsort(xs)
    return float(np.interp(x, np.array(xs)[order], np.array(ys)[order]))


def fairness(raw, news2, operating, X, y, pid, load, window):
    """Deployed alarm vs NEWS2 >= 5 per age band and sex: share of event patients caught, alarm hours, AUROC."""
    age, sex = X[:, features.NAMES.index("Age")], X[:, features.NAMES.index("Gender")]
    groups = {f"age {lo}-{hi - 1}" if hi < 200 else f"age {lo}+": (age >= lo) & (age < hi) for lo, hi in AGE_BANDS}
    groups |= {"female": sex == 0, "male": sex == 1}
    out = {}
    for name, g in groups.items():
        events = len(np.unique(pid[g & window]))
        if events < 20:
            continue
        _, caught, hours = load_and_catch(operating & g, pid, load & g, window & g)
        _, n_caught, n_hours = load_and_catch((news2 >= 5) & g, pid, load & g, window & g)
        lab = g & (y >= 0)
        out[name] = {
            "patients": int(len(np.unique(pid[g]))),
            "eventPatients": events,
            "modelCaught": caught,
            "news2Caught": n_caught,
            "modelAlarmHours": hours,
            "news2AlarmHours": n_hours,
            "auroc": round(float(roc_auc_score(y[lab], raw[lab])), 4) if len(np.unique(y[lab])) == 2 else None,
        }
    return out


def utility(alert, y, pid, hour):
    """PhysioNet 2019 utility, normalised. Labels are 1 from 6h before sepsis onset (t_sepsis = label start + 6)."""
    dt_early, dt_opt, dt_late = -12, -6, 3
    m1, m2, m3 = 1 / (dt_opt - dt_early), -1 / (dt_late - dt_opt), -2 / (dt_late - dt_opt)
    start = np.full(pid.max() + 1, -1)
    first = (y == 1) & ~np.r_[False, (y[:-1] == 1) & (pid[1:] == pid[:-1])]
    start[pid[first]] = hour[first]
    septic = start[pid] >= 0
    d = hour - (start[pid] + 6)

    def u(pred):
        tp = np.where(d <= dt_opt, np.maximum(m1 * d + 2, -0.05), m2 * d - m2 * dt_opt)
        fn = np.where(d <= dt_opt, 0.0, m3 * d - m3 * dt_opt)
        s = np.where(pred, tp, fn)
        s = np.where(d > dt_late, 0.0, s)
        return np.where(septic, s, np.where(pred, -0.05, 0.0)).sum()

    best = (septic & (d >= dt_early) & (d <= dt_late))
    observed, worst, top = u(alert), u(np.zeros_like(alert)), u(best)
    return round(float((observed - worst) / (top - worst)), 4)


def main():
    d = np.load(os.path.join(HERE, "cache", "data.npz"))
    X, pid, hour, patient_site = d["X"], d["pid"], d["hour"], d["site"]
    any_event = np.zeros(len(patient_site), dtype=bool)
    for t in TARGETS:
        any_event[pid[d[f"y_{t}"] == 1]] = True
    part = split_patients(patient_site, any_event)[pid]
    site = patient_site[pid]

    impute = json.load(open(os.path.join(DST, "impute.json")))
    impute = np.array([impute[f] for f in features.NAMES], dtype=np.float32)
    calibration = json.load(open(os.path.join(DST, "calibration.json")))
    metrics_path = os.path.join(DST, "metrics.json")
    metrics = json.load(open(metrics_path))

    test = (part == "test") & np.isin(site, TRAIN_SITES)
    fatigue, headline = {}, {}
    for target in TARGETS:
        y_all = d[f"y_{target}"]
        rows = test & (y_all >= 0 if target != "sepsis" else np.ones(len(y_all), bool))
        rows &= np.isin(site, [s for s in TRAIN_SITES if (y_all[site == s] >= 0).any()])
        Xr, y, p, h, s = X[rows], y_all[rows], pid[rows], hour[rows], site[rows]
        Xr = np.where(np.isnan(Xr), impute, Xr)
        booster = xgb.Booster(model_file=os.path.join(DST, "heads", f"{target}.json"))
        raw = booster.predict(xgb.DMatrix(Xr, feature_names=features.NAMES))
        news2 = Xr[:, NEWS2]
        load, window = windows(y, p, h, target)

        cal = calibration[target]
        to_prob = lambda r: np.interp(r, cal["global"]["x"], cal["global"]["y"])
        model_pts = curve(raw, np.quantile(raw[load], 1 - LEVELS), p, load, window, "threshold")
        for pt in model_pts:
            pt["threshold"] = round(float(to_prob(pt["threshold"])), 4)
        news2_pts = curve(news2, range(1, 11), p, load, window, "cutoff")

        operating = np.zeros(len(raw), bool)  # deployed alarm: each patient's own site threshold
        for site_name in np.unique(s):
            m = s == site_name
            operating[m] = raw[m] >= cal.get(site_name, cal["global"])["raw_threshold"]
        per_day, caught, hours = load_and_catch(operating, p, load, window)
        fatigue[target] = {
            "model": model_pts,
            "news2": news2_pts,
            "operating": {"threshold": cal["global"]["threshold"], "alertsPerBedDay": per_day, "alarmHours": hours, "caught": caught},
            "patients": int(len(np.unique(p))),
            "eventPatients": int(len(np.unique(p[window]))),
            "fairness": fairness(raw, news2, operating, Xr, y, p, load, window),
        }
        for g, r in fatigue[target]["fairness"].items():
            print(f"   {g:10} caught {r['modelCaught']:.1%} (NEWS2 {r['news2Caught']:.1%})  alarm hours {r['modelAlarmHours']:.1%} "
                  f"(NEWS2 {r['news2AlarmHours']:.1%})  AUROC {r['auroc']}  n_events {r['eventPatients']}")

        n5 = next(pt for pt in news2_pts if pt["cutoff"] == 5)
        model_caught = at(model_pts, "alertsPerBedDay", n5["alertsPerBedDay"], "caught")
        model_load = at(model_pts, "caught", n5["caught"], "alertsPerBedDay")
        hours_caught = at(model_pts, "alarmHours", n5["alarmHours"], "caught")
        hours_needed = at(model_pts, "caught", n5["caught"], "alarmHours")
        headline[target] = {
            # Conservative: same share of hours spent alarming as NEWS2 >= 5.
            "sameAlarmHours": {"alarmHours": n5["alarmHours"], "modelCaught": round(hours_caught, 4), "news2Caught": n5["caught"]},
            "sameCatchHours": {
                "caught": n5["caught"],
                "modelAlarmHours": round(hours_needed, 4),
                "news2AlarmHours": n5["alarmHours"],
                "fewerAlarmHours": round(1 - hours_needed / max(n5["alarmHours"], 1e-9), 4),
            },
            # Same number of alarms that start (the model's alarms are fewer but last longer).
            "news2Burden": {"alertsPerBedDay": n5["alertsPerBedDay"], "modelCaught": round(model_caught, 4), "news2Caught": n5["caught"]},
            "news2Recall": {
                "caught": n5["caught"],
                "modelAlertsPerBedDay": round(model_load, 4),
                "news2AlertsPerBedDay": n5["alertsPerBedDay"],
                "fewerAlarms": round(1 - model_load / max(n5["alertsPerBedDay"], 1e-9), 4),
            },
        }
        print(f"{target:12} same alarm hours ({n5['alarmHours']:.1%}): model {hours_caught:.1%} vs NEWS2 {n5['caught']:.1%} | "
              f"same catch: {hours_needed:.1%} of hours ({headline[target]['sameCatchHours']['fewerAlarmHours']:.0%} fewer)")
        print(f"{'':12} NEWS2>=5: {n5['alertsPerBedDay']:.3f}/bed-day catches {n5['caught']:.1%} | model at same load "
              f"{model_caught:.1%} | model at same catch {model_load:.3f}/bed-day ({headline[target]['news2Recall']['fewerAlarms']:.0%} fewer)")

    # Official challenge utility for sepsis on 2019 hospitals: threshold tuned on validation, scored on test.
    y_s = d["y_sepsis"]
    sep = lambda name: (part == name) & np.isin(site, ["A", "B"])
    booster = xgb.Booster(model_file=os.path.join(DST, "heads", "sepsis.json"))
    pred = lambda m: booster.predict(xgb.DMatrix(np.where(np.isnan(X[m]), impute, X[m]), feature_names=features.NAMES))
    va, te = sep("val"), sep("test")
    raw_va, raw_te = pred(va), pred(te)
    grid = np.quantile(raw_va, 1 - np.geomspace(0.005, 0.3, 30))
    u_va = [utility(raw_va >= t, y_s[va], pid[va], hour[va]) for t in grid]
    best_t = grid[int(np.argmax(u_va))]
    headline["sepsisUtility"] = {
        "model": utility(raw_te >= best_t, y_s[te], pid[te], hour[te]),
        "news2": max(utility(X[te, NEWS2] >= c, y_s[te], pid[te], hour[te]) for c in range(1, 11)),
        "note": "PhysioNet/CinC 2019 normalised utility on held-out A/B patients (threshold tuned on validation). "
        "NEWS2 gets its best cut-off on test. The challenge winner scored 0.360 on the hidden test set (not directly comparable).",
    }
    print(f"sepsis utility: model {headline['sepsisUtility']['model']} vs NEWS2 (best cut-off) {headline['sepsisUtility']['news2']}")

    json.dump(fatigue, open(os.path.join(DST, "fatigue.json"), "w"), indent=1)
    metrics["headline"] = headline
    json.dump(metrics, open(metrics_path, "w"), indent=2)
    print(f"wrote fatigue.json and metrics.json headline to {os.path.abspath(DST)}")


if __name__ == "__main__":
    main()
