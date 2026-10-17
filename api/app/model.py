"""Risk model. Uses the real Snap ML model when MODEL_DIR has one, else a NEWS2-based stub.

Export contract (ml/train.py --export writes these into MODEL_DIR):
- model.json     XGBoost booster saved with booster.save_model("model.json")
- features.json  ordered feature names; must equal app.features.NAMES
- impute.json    {feature: value}. Snap ML ignores XGBoost's missing-value branches, so we
                 impute identically at train and serve time.
- metrics.json   evaluation report incl. the operating threshold

Every model scores *histories*: one [T, len(features.RAW)] raw array per patient, scored at its last hour.
"""

import json
import math
import os
import platform
import sys

import numpy as np

from . import features, news2

MODEL_DIR = os.getenv("MODEL_DIR", "/app/model")

# Features that describe the admission rather than the patient's physiology are never shown as drivers.
NOT_DRIVERS = {"ICULOS", "HospAdmTime", "Unit1", "Unit2", "n_measured"}
DERIVED = {"ShockIndex", "BUN_Creatinine", "NEWS2", "qSOFA_partial", "n_measured"}


def _group(name: str) -> str:
    """Feature -> the clinical variable it comes from, e.g. Temp_max6h -> Temp."""
    if name in DERIVED:
        return name
    return max((r for r in features.RAW if name == r or name.startswith(r + "_")), key=len)


def _last_rows(histories: list[np.ndarray]) -> np.ndarray:
    return np.vstack([features.patient_features(h)[-1:] for h in histories])


class StubModel:
    """Placeholder until the real model lands: squashes the NEWS2 aggregate into 0..1."""

    backend = "stub-news2"
    tree_format = None
    features = features.NAMES
    metrics = {}
    threshold = float(os.getenv("THRESHOLD") or 0.5)

    def score(self, histories: list[np.ndarray]) -> tuple[list[float], list[list[dict]]]:
        F = _last_rows(histories)
        n2 = F[:, features.NAMES.index("NEWS2")]
        probs = [1 / (1 + math.exp(-(s - 5))) for s in n2]
        drivers = []
        for row in F:
            parts = news2.components(dict(zip(features.RAW, row[: len(features.RAW)].tolist())))
            top = sorted(parts.items(), key=lambda kv: kv[1], reverse=True)[:3]
            drivers.append([{"feature": k, "contribution": float(v)} for k, v in top if v > 0])
        return probs, drivers


class SnapModel:
    backend = "snapml"

    def __init__(self):
        from snapml import BoostingMachineClassifier

        names = json.load(open(os.path.join(MODEL_DIR, "features.json")))
        if names != features.NAMES:
            raise ValueError("features.json does not match app.features.NAMES; re-export the model")

        self.features = names
        impute = json.load(open(os.path.join(MODEL_DIR, "impute.json")))
        self.impute = np.array([impute[f] for f in names], dtype=np.float32)
        metrics_path = os.path.join(MODEL_DIR, "metrics.json")
        self.metrics = json.load(open(metrics_path)) if os.path.exists(metrics_path) else {}
        self.threshold = float(os.getenv("THRESHOLD") or self.metrics.get("threshold", 0.5))

        self.model = BoostingMachineClassifier()
        self.model.import_model(os.path.join(MODEL_DIR, "model.json"), input_type="xgb_json", tree_format="auto")
        self.model.set_params(n_jobs=os.cpu_count())
        self.tree_format = str(self.model.booster_.optimized_tree_format_)

        groups = {}
        for i, name in enumerate(names):
            groups.setdefault(_group(name), []).append(i)
        self.groups = {g: idx for g, idx in groups.items() if g not in NOT_DRIVERS}

    def _proba(self, X: np.ndarray) -> np.ndarray:
        X = np.where(np.isnan(X), self.impute, X).astype(np.float32)
        return self.model.predict_proba(X)[:, 1]

    def score(self, histories: list[np.ndarray]) -> tuple[list[float], list[list[dict]]]:
        F = _last_rows(histories)
        probs = self._proba(F)

        # Drivers by occlusion: reset one clinical variable (all its features) to the population value
        # and see how far the risk falls. One batched call, so it also runs on the AI accelerator.
        names = list(self.groups)
        occluded = np.repeat(F, len(names), axis=0)
        for j, g in enumerate(names):
            occluded[j :: len(names), self.groups[g]] = self.impute[self.groups[g]]
        drops = probs[:, None] - self._proba(occluded).reshape(len(F), len(names))

        drivers = []
        for i in range(len(F)):
            top = np.argsort(-drops[i])[:3]
            drivers.append([
                {"feature": names[j], "contribution": round(float(drops[i, j]), 4)} for j in top if drops[i, j] > 0
            ])
        return probs.tolist(), drivers


def load():
    if not os.path.exists(os.path.join(MODEL_DIR, "model.json")):
        return StubModel()

    try:
        return SnapModel()
    except Exception as e:  # keep the demo alive if the export is broken
        print(f"!! failed to load Snap ML model, using stub: {e}", file=sys.stderr)
        return StubModel()


def platform_info() -> dict:
    return {"arch": platform.machine(), "byteorder": sys.byteorder}
