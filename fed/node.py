"""A hospital in the federation. Its patient data never leaves this process: it only ever returns
models, model metrics and aggregate statistics (feature medians, row counts).

Runs in-process for simulation (coordinator.py --local) or behind server.py in its own container.
"""

import csv
import glob
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import xgboost as xgb

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(ROOT, "ml"))
sys.path.insert(0, os.path.join(ROOT, "api"))
import prepare  # noqa: E402
import train  # noqa: E402
from app import features  # noqa: E402
from sklearn.metrics import average_precision_score, roc_auc_score  # noqa: E402

import dp  # noqa: E402

PARAMS = {
    "objective": "binary:logistic",
    "tree_method": "hist",
    "max_depth": 6,
    "eta": 0.05,
    "lambda": 1.0,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 5,
    "scale_pos_weight": 5,
    "nthread": os.cpu_count(),
}


def _load_model(model_json: str | None) -> xgb.Booster | None:
    if not model_json:
        return None
    booster = xgb.Booster()
    booster.load_model(bytearray(model_json, "utf-8"))
    return booster


def _dump(booster: xgb.Booster) -> str:
    return booster.save_raw("json").decode()


class Hospital:
    def __init__(self, name: str, data_dir: str, outcomes: str | None = None, seed: int = 2026):
        self.name = name
        paths = sorted(glob.glob(os.path.join(data_dir, "*.psv")))
        if not paths:
            raise SystemExit(f"{name}: no .psv files in {data_dir}")

        deaths = {}
        if outcomes and os.path.exists(outcomes):
            with open(outcomes) as fh:
                deaths = {r["patient"]: float(r["in_hospital_death"]) for r in csv.DictReader(fh) if r["in_hospital_death"]}
        jobs = [(p, deaths.get(os.path.basename(p)[:-4])) for p in paths]
        with ProcessPoolExecutor() as pool:
            results = list(pool.map(prepare.load, jobs, chunksize=64))

        lengths = [len(r[0]) for r in results]
        self.X = np.concatenate([r[0] for r in results])
        self.y = {t: np.concatenate([r[1][t] for r in results]) for t in prepare.TARGETS}
        self.pid = np.repeat(np.arange(len(results)), lengths)

        # Local 70/15/15 patient split, stratified by "any event".
        any_event = np.zeros(len(results), dtype=bool)
        for y in self.y.values():
            any_event[self.pid[y == 1]] = True
        rng = np.random.default_rng(seed)
        part = np.empty(len(results), dtype="<U5")
        for e in (False, True):
            idx = np.flatnonzero(any_event == e)
            rng.shuffle(idx)
            a, b = int(0.7 * len(idx)), int(0.85 * len(idx))
            part[idx[:a]], part[idx[a:b]], part[idx[b:]] = "train", "val", "test"
        self.part = part[self.pid]
        self.news2 = self.X[:, features.NAMES.index("NEWS2")].copy()
        self.Xi = None
        print(f"[{name}] {len(results)} patients, {len(self.X)} rows")

    # ---- aggregate statistics only ----
    def stats(self) -> dict:
        tr = self.part == "train"
        med = np.nanmedian(self.X[tr], axis=0)
        return {
            "rows": int(tr.sum()),
            "median": [None if np.isnan(v) else float(v) for v in med],
            "events": {t: int(len(np.unique(self.pid[(y == 1) & tr]))) for t, y in self.y.items()},
        }

    def set_impute(self, impute: list[float]):
        imp = np.asarray(impute, dtype=np.float32)
        self.Xi = np.where(np.isnan(self.X), imp, self.X).astype(np.float32)
        self._dtrain = {}

    def _rows(self, target: str, split: str) -> np.ndarray:
        return (self.y[target] >= 0) & (self.part == split)

    # ---- learning ----
    def train(self, model_json: str | None, target: str, trees: int, epsilon: float | None = None, seed: int = 0) -> dict:
        rows = self._rows(target, "train")
        if not rows.any():
            return {"model": model_json, "trees_added": 0, "rows": 0}

        if target not in self._dtrain:  # reused across visits; the model is the only thing that changes
            self._dtrain[target] = xgb.DMatrix(self.Xi[rows], label=self.y[target][rows], feature_names=features.NAMES)
        start = _load_model(model_json)
        before = start.num_boosted_rounds() if start else 0
        booster = xgb.train({**PARAMS, "seed": seed}, self._dtrain[target], trees, xgb_model=start)
        out = _dump(booster)
        if epsilon:
            out = dp.perturb(out, before, epsilon, PARAMS, seed)
        return {"model": out, "trees_added": trees, "rows": int(rows.sum())}

    def evaluate(self, model_json: str, target: str, split: str = "test") -> dict:
        rows = self._rows(target, split)
        y = self.y[target][rows]
        if len(np.unique(y)) < 2:
            return {"rows": int(rows.sum())}

        p = _load_model(model_json).predict(xgb.DMatrix(self.Xi[rows], feature_names=features.NAMES))
        return {
            "rows": int(rows.sum()),
            "auroc": round(roc_auc_score(y, p), 4),
            "auprc": round(average_precision_score(y, p), 4),
            "news2_auroc": round(roc_auc_score(y, self.news2[rows]), 4),
        }

    def calibrate(self, model_json: str, target: str) -> dict | None:
        """Fit this hospital's own calibration and NEWS2-equal alarm threshold on its validation rows."""
        rows = self._rows(target, "val")
        y = self.y[target][rows]
        if (y == 1).sum() < 20:
            return None

        raw = _load_model(model_json).predict(xgb.DMatrix(self.Xi[rows], feature_names=features.NAMES))
        return train.Calibrator(raw, y).export(train.news2_burden_threshold(raw, self.news2[rows]))

    # ---- simulation only: lets the coordinator build the centralised reference ----
    def train_rows(self, target: str):
        rows = self._rows(target, "train")
        return self.Xi[rows], self.y[target][rows]
