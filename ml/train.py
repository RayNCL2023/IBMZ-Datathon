"""Train the sepsis model on the cached features and compare it with NEWS2.

usage: .venv/bin/python train.py [--train-on A|B|AB] [--export]
  --train-on  which hospital(s) to train on (default AB = pooled). Test is always reported per hospital.
  --export    write model.json, features.json, impute.json, metrics.json to ../api/model/
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
ONSET_SHIFT = 6  # SepsisLabel turns on 6h before clinical onset
NEWS2 = features.NAMES.index("NEWS2")


def split_patients(y, pid, hospital):
    """70/15/15 by patient, stratified by hospital x ever-septic."""
    n = len(hospital)
    septic = np.zeros(n, dtype=bool)
    septic[pid[y == 1]] = True
    rng = np.random.default_rng(SEED)
    part = np.empty(n, dtype="<U5")
    for h in ("A", "B"):
        for s in (False, True):
            idx = np.flatnonzero((hospital == h) & (septic == s))
            rng.shuffle(idx)
            a, b = int(0.7 * len(idx)), int(0.85 * len(idx))
            part[idx[:a]], part[idx[a:b]], part[idx[b:]] = "train", "val", "test"
    return part


def patient_report(alert, y, pid, hour):
    """Septic patients: alerted before clinical onset, and how early. Others: share with any alert."""
    caught, leads, septic_n, false_n, other_n = 0, [], 0, 0, 0
    order = np.argsort(pid, kind="stable")
    bounds = np.flatnonzero(np.diff(pid[order])) + 1
    for rows in np.split(order, bounds):
        labels = y[rows]
        if labels.any():
            septic_n += 1
            onset = hour[rows][labels.argmax()] + ONSET_SHIFT
            early = rows[alert[rows] & (hour[rows] < onset)]
            if len(early):
                caught += 1
                leads.append(onset - hour[early].min())
            continue
        other_n += 1
        false_n += bool(alert[rows].any())
    return {
        "septic_patients": septic_n,
        "caught_before_onset": round(caught / septic_n, 4),
        "median_lead_hours": float(np.median(leads)) if leads else None,
        "non_septic_patients": other_n,
        "non_septic_with_alert": round(false_n / other_n, 4),
    }


def evaluate(p, news2, y, pid, hour, threshold):
    news2_alert = news2 >= 5  # aggregate rule; the single-parameter-3 rule is in the API's news2.score
    return {
        "rows": int(len(y)),
        "model": {
            "auroc": round(roc_auc_score(y, p), 4),
            "auprc": round(average_precision_score(y, p), 4),
            "alert_rate": round(float((p >= threshold).mean()), 4),
            **patient_report(p >= threshold, y, pid, hour),
        },
        "news2": {
            "auroc": round(roc_auc_score(y, news2), 4),
            "auprc": round(average_precision_score(y, news2), 4),
            "alert_rate": round(float(news2_alert.mean()), 4),
            **patient_report(news2_alert, y, pid, hour),
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--train-on", default="AB", choices=["A", "B", "AB"])
    ap.add_argument("--export", action="store_true")
    args = ap.parse_args()

    d = np.load(os.path.join(HERE, "cache", "data.npz"))
    X, y, pid, hour, hospital, names = d["X"], d["y"], d["pid"], d["hour"], d["hospital"], d["patients"]
    assert list(d["names"]) == features.NAMES, "cache is stale, rerun prepare.py"

    part = split_patients(y, pid, hospital)[pid]
    site = hospital[pid]
    in_site = np.isin(site, list(args.train_on))
    tr, va = (part == "train") & in_site, (part == "val") & in_site

    # Snap ML ignores XGBoost's missing-value branches, so the model must never see NaN.
    impute = np.nanmedian(X[tr], axis=0)
    impute = np.where(np.isnan(impute), 0.0, impute)
    news2 = X[:, NEWS2].copy()
    X = np.where(np.isnan(X), impute, X).astype(np.float32)

    params = {
        "objective": "binary:logistic",
        "eval_metric": "aucpr",
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
    booster = xgb.train(params, dtr, 3000, evals=[(dva, "val")], early_stopping_rounds=150, verbose_eval=250)
    best = booster[: booster.best_iteration + 1]

    # Operating point: same row-level alarm burden as NEWS2 >= 5 on validation.
    p_va = best.predict(dva)
    threshold = float(np.quantile(p_va, 1 - (news2[va] >= 5).mean()))

    report = {"train_on": args.train_on, "trees": best.num_boosted_rounds(), "threshold": round(threshold, 4), "test": {}}
    for h in ("A", "B", "AB"):
        te = (part == "test") & np.isin(site, list(h))
        p = best.predict(xgb.DMatrix(X[te], feature_names=features.NAMES))
        report["test"][h] = evaluate(p, news2[te], y[te], pid[te], hour[te], threshold)

    gain = best.get_score(importance_type="gain")
    report["top_features"] = [k for k, _ in sorted(gain.items(), key=lambda kv: -kv[1])[:15]]
    print(json.dumps(report, indent=2))

    out = os.path.join(HERE, "out", args.train_on)
    os.makedirs(out, exist_ok=True)
    json.dump(report, open(os.path.join(out, "metrics.json"), "w"), indent=2)

    if not args.export:
        return

    dst = os.path.join(HERE, "..", "api", "model")
    best.save_model(os.path.join(dst, "model.json"))
    json.dump(features.NAMES, open(os.path.join(dst, "features.json"), "w"))
    json.dump(dict(zip(features.NAMES, map(float, impute))), open(os.path.join(dst, "impute.json"), "w"))
    json.dump(report, open(os.path.join(dst, "metrics.json"), "w"), indent=2)

    # The demo ward only replays held-out test patients, so the live demo never shows training data.
    test_ids = sorted({f"{'training_setA' if hospital[i] == 'A' else 'training_setB'}/{names[i]}" for i in np.unique(pid[part == "test"])})
    json.dump(test_ids, open(os.path.join(dst, "test_patients.json"), "w"))

    # Parity sample: the VM checks Snap ML on NNPA gives the same probabilities as XGBoost here.
    te = np.flatnonzero(part == "test")[:: 500]
    np.savez(os.path.join(dst, "parity.npz"), X=X[te], p=best.predict(xgb.DMatrix(X[te], feature_names=features.NAMES)))
    print(f"exported to {os.path.abspath(dst)}")


if __name__ == "__main__":
    main()
