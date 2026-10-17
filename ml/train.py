"""Train one risk head per target, calibrate it per site, and compare it with NEWS2 and a one-signal baseline.

usage: .venv/bin/python train.py [--targets sepsis hypotension aki resp mortality] [--sites A B M] [--export]
  --targets  heads to train (default: all)
  --sites    training sites (default: every site with labels for the target)
  --export   write heads/<target>.json, calibration.json and the shared features.json, impute.json,
             metrics.json to ../api/model/

Sites: A, B = PhysioNet 2019 hospitals; M = PhysioNet 2012; C = eICU demo.
Patients are split 70/15/15 (train/val/test) in A, B and M. eICU is split 50/20/30: "ctrain" is only used
by heads in EICU_TRAIN, "cval" fits eICU's own calibration and threshold, and "external" (30%) is never
trained or tuned on by any head.
"""

import argparse
import json
import os
import sys

import numpy as np
import xgboost as xgb
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import average_precision_score, roc_auc_score

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "api"))
from app import features  # noqa: E402

SEED = 2026
TARGETS = ["sepsis", "hypotension", "aki", "resp", "mortality"]
TRAIN_SITES = ["A", "B", "M"]
SITES = TRAIN_SITES + ["C"]
# eICU only improved the respiratory head (0.793 -> 0.810 on held-out eICU); other heads stay external-only.
EICU_TRAIN = {"resp"}
NEWS2 = features.NAMES.index("NEWS2")
# The single bedside signal a clinician would watch for each risk; sign = +1 when higher means riskier.
BASELINE = {
    "sepsis": ("NEWS2", 1),
    "hypotension": ("MAP", -1),
    "aki": ("Creatinine", 1),
    "resp": ("O2Sat", -1),
    "mortality": ("NEWS2", 1),
}
DST = os.path.join(HERE, "..", "api", "model")


def split_patients(site, any_event):
    """Stratified by site x any event. A/B/M: 70/15/15 train/val/test. C: 50/20/30 ctrain/cval/external."""
    rng = np.random.default_rng(SEED)
    part = np.empty(len(site), dtype="<U8")
    for s in SITES:
        names, cuts = (("ctrain", "cval", "external"), (0.5, 0.7)) if s == "C" else (("train", "val", "test"), (0.7, 0.85))
        for e in (False, True):
            idx = np.flatnonzero((site == s) & (any_event == e))
            rng.shuffle(idx)
            a, b = int(cuts[0] * len(idx)), int(cuts[1] * len(idx))
            part[idx[:a]], part[idx[a:b]], part[idx[b:]] = names
    return part


class Calibrator:
    """Isotonic map from raw score to observed event rate, exported as points for np.interp in the API."""

    def __init__(self, raw, y):
        iso = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1).fit(raw, y)
        self.x, self.y = iso.X_thresholds_, iso.y_thresholds_

    def __call__(self, raw):
        return np.interp(raw, self.x, self.y)

    def export(self, raw_threshold):
        """Alerts compare the raw score with raw_threshold (isotonic steps would make ties at a calibrated
        threshold overshoot the alarm budget); `threshold` is the same cut-off in calibrated units, for display."""
        return {
            "x": np.round(self.x, 6).tolist(),
            "y": np.round(self.y, 6).tolist(),
            "raw_threshold": round(raw_threshold, 6),
            "threshold": round(float(self(raw_threshold)), 4),
        }


def news2_burden_threshold(p, news2):
    """Threshold giving the same share of alerting rows as NEWS2 >= 5."""
    return float(np.quantile(p, 1 - (news2 >= 5).mean()))


def ece(p, y, bins=10):
    """Expected calibration error: average gap between predicted and observed risk, over risk deciles."""
    edges = np.quantile(p, np.linspace(0, 1, bins + 1))
    idx = np.clip(np.searchsorted(edges, p, side="right") - 1, 0, bins - 1)
    return float(sum(abs(p[idx == b].mean() - y[idx == b].mean()) * (idx == b).mean() for b in range(bins) if (idx == b).any()))


def warned(alert, y, pid):
    """Patients with an event who got at least one alert in the hours before it; false-alarm share of the rest."""
    event_patients = np.unique(pid[y == 1])
    caught = np.unique(pid[(y == 1) & alert])
    quiet = np.setdiff1d(np.unique(pid), event_patients)
    false = np.unique(pid[alert & np.isin(pid, quiet)])
    return {
        "event_patients": int(len(event_patients)),
        "warned_before_event": round(len(caught) / max(len(event_patients), 1), 4),
        "no_event_with_alert": round(len(false) / max(len(quiet), 1), 4),
    }


def scores(score, y, pid, alert):
    return {
        "auroc": round(roc_auc_score(y, score), 4),
        "auprc": round(average_precision_score(y, score), 4),
        "alert_rate": round(float(alert.mean()), 4),
        **warned(alert, y, pid),
    }


def evaluate(raw, prob, alert, X, y, pid, target):
    name, sign = BASELINE[target]
    news2 = X[:, NEWS2]
    return {
        "rows": int(len(y)),
        "positive_rate": round(float(y.mean()), 4),
        "model": {
            **scores(raw, y, pid, alert),
            "calibration_error_raw": round(ece(raw, y), 4),
            "calibration_error": round(ece(prob, y), 4),
        },
        "news2": scores(news2, y, pid, news2 >= 5),
        f"baseline_{name}": round(roc_auc_score(y, sign * X[:, features.NAMES.index(name)]), 4),
    }


def train_head(target, y, X, pid, part, site, sites):
    labelled = y >= 0
    tr = labelled & np.isin(site, sites) & (part == "train")
    if target in EICU_TRAIN:
        tr |= labelled & (part == "ctrain")
    va = labelled & np.isin(site, sites) & (part == "val")
    if not tr.any():
        print(f"skip {target}: no labelled rows in {sites}")
        return None, None, None

    params = {
        "objective": "binary:logistic",
        "eval_metric": "auc",
        "tree_method": "hist",
        "max_depth": 6,
        "eta": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "min_child_weight": 5,
        "scale_pos_weight": 5,
        "nthread": os.cpu_count(),
        "seed": SEED,
    }
    dtr = xgb.DMatrix(X[tr], label=y[tr], feature_names=features.NAMES)
    dva = xgb.DMatrix(X[va], label=y[va], feature_names=features.NAMES)
    booster = xgb.train(params, dtr, 3000, evals=[(dva, "val")], early_stopping_rounds=200, verbose_eval=False)
    best = booster[: booster.best_iteration + 1]
    predict = lambda rows: best.predict(xgb.DMatrix(X[rows], feature_names=features.NAMES))

    # Calibration + operating point per site, each fitted on that site's own held-out tuning rows
    # (a hospital can do this locally, without sharing data). "global" pools the training sites' val rows.
    calib = {}
    tuning = {"global": va, **{s: labelled & (site == s) & (part == ("cval" if s == "C" else "val")) for s in SITES}}
    for s, rows in tuning.items():
        if rows.sum() < 500 or len(np.unique(y[rows])) < 2 or (y[rows] == 1).sum() < 20:
            continue
        raw = predict(rows)
        calib[s] = (Calibrator(raw, y[rows]), news2_burden_threshold(raw, X[rows, NEWS2]))

    report = {
        "train_sites": sites + (["C (50%)"] if target in EICU_TRAIN else []),
        "trees": best.num_boosted_rounds(),
        "threshold": round(float(calib["global"][0](calib["global"][1])), 4),
        "site_thresholds": {s: round(float(c(t)), 4) for s, (c, t) in calib.items()},
        "test": {},
    }
    groups = [(s, (part == "test") & (site == s)) for s in TRAIN_SITES]
    groups += [("all", part == "test"), ("C_external", part == "external")]
    for name, rows in groups:
        rows = rows & labelled
        if rows.sum() == 0 or len(np.unique(y[rows])) < 2:
            continue
        raw = predict(rows)
        prob, alert = np.empty(len(raw)), np.empty(len(raw), dtype=bool)
        for s in np.unique(site[rows]):  # each patient judged by their own site's calibration and threshold
            m = site[rows] == s
            c, t = calib.get(s, calib["global"])
            prob[m], alert[m] = c(raw[m]), raw[m] >= t
        report["test"][name] = evaluate(raw, prob, alert, X[rows], y[rows], pid[rows], target)

    gain = best.get_score(importance_type="gain")
    report["top_features"] = [k for k, _ in sorted(gain.items(), key=lambda kv: -kv[1])[:10]]
    exported = {s: c.export(t) for s, (c, t) in calib.items()}
    return best, report, exported


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--targets", nargs="+", default=TARGETS, choices=TARGETS)
    ap.add_argument("--sites", nargs="+", choices=TRAIN_SITES)
    ap.add_argument("--export", action="store_true")
    args = ap.parse_args()

    d = np.load(os.path.join(HERE, "cache", "data.npz"))
    assert list(d["names"]) == features.NAMES, "cache is stale, rerun prepare.py"
    X, pid, patient_site = d["X"], d["pid"], d["site"]

    any_event = np.zeros(len(patient_site), dtype=bool)
    for t in TARGETS:
        any_event[pid[d[f"y_{t}"] == 1]] = True
    part = split_patients(patient_site, any_event)[pid]
    site = patient_site[pid]

    # One shared imputation for every head. Snap ML ignores XGBoost's missing-value branches,
    # so models must never see NaN, and serving imputes with exactly these values.
    impute = np.nanmedian(X[(part == "train") & np.isin(site, TRAIN_SITES)], axis=0)
    impute = np.where(np.isnan(impute), 0.0, impute)
    X = np.where(np.isnan(X), impute, X).astype(np.float32)

    metrics_path, calib_path = os.path.join(DST, "metrics.json"), os.path.join(DST, "calibration.json")
    load = lambda p: json.load(open(p)) if args.export and os.path.exists(p) else {}
    metrics, calibration = load(metrics_path), load(calib_path)
    metrics.setdefault("heads", {})

    heads = {}
    for target in args.targets:
        y = d[f"y_{target}"]
        sites = args.sites or [s for s in TRAIN_SITES if (y[site == s] >= 0).any()]
        best, report, calib = train_head(target, y, X, pid, part, site, sites)
        if best is None:
            continue

        heads[target] = best
        metrics["heads"][target] = report
        calibration[target] = calib
        print(f"\n== {target} ==\n{json.dumps(report, indent=1)}")
        out = os.path.join(HERE, "out", "-".join(sites))
        os.makedirs(out, exist_ok=True)
        json.dump(report, open(os.path.join(out, f"{target}.json"), "w"), indent=2)

    if not args.export:
        return

    os.makedirs(os.path.join(DST, "heads"), exist_ok=True)
    for target, best in heads.items():
        best.save_model(os.path.join(DST, "heads", f"{target}.json"))
    json.dump(features.NAMES, open(os.path.join(DST, "features.json"), "w"))
    json.dump(dict(zip(features.NAMES, map(float, impute))), open(os.path.join(DST, "impute.json"), "w"))
    json.dump(metrics, open(metrics_path, "w"), indent=2)
    json.dump(calibration, open(calib_path, "w"))

    # The demo ward (2019 files on the VM) only replays held-out test patients from hospitals A and B.
    test_pids = np.unique(pid[(part == "test") & np.isin(site, ["A", "B"])])
    json.dump(sorted(d["patients"][test_pids].tolist()), open(os.path.join(DST, "test_patients.json"), "w"))

    # Parity sample: the VM checks Snap ML on NNPA gives the same raw scores as XGBoost here.
    sample = np.flatnonzero(part == "test")[::500]
    dsample = xgb.DMatrix(X[sample], feature_names=features.NAMES)
    np.savez(os.path.join(DST, "parity.npz"), X=X[sample], **{t: b.predict(dsample) for t, b in heads.items()})
    print(f"exported {list(heads)} to {os.path.abspath(DST)}")


if __name__ == "__main__":
    main()
