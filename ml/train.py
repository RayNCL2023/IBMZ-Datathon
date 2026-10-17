"""Train one risk head per target on the cached features and compare each with NEWS2 and a one-signal baseline.

usage: .venv/bin/python train.py [--targets sepsis hypotension aki resp mortality] [--sites A B M] [--export]
  --targets  heads to train (default: all)
  --sites    training sites (default: every site that has labels for the target; C is never trained on)
  --export   write heads/<target>.json plus the shared features.json, impute.json, metrics.json to ../api/model/
"""

import argparse
import json
import os
import sys

import numpy as np
import xgboost as xgb
from sklearn.metrics import average_precision_score, roc_auc_score

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "api"))
from app import features  # noqa: E402

SEED = 2026
TARGETS = ["sepsis", "hypotension", "aki", "resp", "mortality"]
TRAIN_SITES = ["A", "B", "M"]
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
    """70/15/15 by patient, stratified by site x any event. eICU (C) is external test only."""
    rng = np.random.default_rng(SEED)
    part = np.full(len(site), "external", dtype="<U8")
    for s in TRAIN_SITES:
        for e in (False, True):
            idx = np.flatnonzero((site == s) & (any_event == e))
            rng.shuffle(idx)
            a, b = int(0.7 * len(idx)), int(0.85 * len(idx))
            part[idx[:a]], part[idx[a:b]], part[idx[b:]] = "train", "val", "test"
    return part


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


def evaluate(p, X, y, pid, threshold, target):
    name, sign = BASELINE[target]
    base = sign * X[:, features.NAMES.index(name)]
    news2 = X[:, NEWS2]
    return {
        "rows": int(len(y)),
        "positive_rate": round(float(y.mean()), 4),
        "model": scores(p, y, pid, p >= threshold),
        "news2": scores(news2, y, pid, news2 >= 5),
        f"baseline_{name}": round(roc_auc_score(y, base), 4),
    }


def train_head(target, d, X, part, site, sites):
    y = d[f"y_{target}"]
    labelled = y >= 0
    in_sites = np.isin(site, sites)
    tr, va = labelled & in_sites & (part == "train"), labelled & in_sites & (part == "val")
    if not tr.any():
        print(f"skip {target}: no labelled rows in {sites}")
        return None, None

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

    # Operating point: the same row-level alarm burden as NEWS2 >= 5 on this target's validation rows.
    threshold = float(np.quantile(best.predict(dva), 1 - (X[va, NEWS2] >= 5).mean()))

    pid = d["pid"]
    report = {"train_sites": sites, "trees": best.num_boosted_rounds(), "threshold": round(threshold, 4), "test": {}}
    groups = [(s, (part == "test") & (site == s)) for s in TRAIN_SITES]
    groups += [("all", part == "test"), ("C_external", part == "external")]
    for name, rows in groups:
        rows = rows & labelled
        if rows.sum() == 0 or len(np.unique(y[rows])) < 2:
            continue
        p = best.predict(xgb.DMatrix(X[rows], feature_names=features.NAMES))
        report["test"][name] = evaluate(p, X[rows], y[rows], pid[rows], threshold, target)

    gain = best.get_score(importance_type="gain")
    report["top_features"] = [k for k, _ in sorted(gain.items(), key=lambda kv: -kv[1])[:10]]
    return best, report


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

    metrics_path = os.path.join(DST, "metrics.json")
    metrics = json.load(open(metrics_path)) if args.export and os.path.exists(metrics_path) else {}
    if "heads" not in metrics:
        metrics = {"heads": {}}

    heads = {}
    for target in args.targets:
        sites = args.sites or [s for s in TRAIN_SITES if (d[f"y_{target}"][site == s] >= 0).any()]
        best, report = train_head(target, d, X, part, site, sites)
        if best is None:
            continue

        heads[target] = best
        metrics["heads"][target] = report
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

    # The demo ward (2019 files on the VM) only replays held-out test patients from hospitals A and B.
    test_pids = np.unique(pid[(part == "test") & np.isin(site, ["A", "B"])])
    json.dump(sorted(d["patients"][test_pids].tolist()), open(os.path.join(DST, "test_patients.json"), "w"))

    # Parity sample: the VM checks Snap ML on NNPA gives the same probabilities as XGBoost here.
    sample = np.flatnonzero(part == "test")[::500]
    dsample = xgb.DMatrix(X[sample], feature_names=features.NAMES)
    np.savez(os.path.join(DST, "parity.npz"), X=X[sample], **{t: b.predict(dsample) for t, b in heads.items()})
    print(f"exported {list(heads)} to {os.path.abspath(DST)}")


if __name__ == "__main__":
    main()
