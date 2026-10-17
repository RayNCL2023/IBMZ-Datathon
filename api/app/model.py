"""Risk model. Uses the real Snap ML model when MODEL_DIR has one, else a NEWS2-based stub.

The ML lead's export contract (drop these into MODEL_DIR):
- model.json   XGBoost booster saved with booster.save_model("model.json")
- features.json  ordered list of feature names the model expects
- impute.json    {feature: value} used for missing values. Snap ML ignores XGBoost's
                 missing-value branches, so we MUST impute identically at train and serve time.
"""

import json
import math
import os
import platform
import sys

from . import news2

MODEL_DIR = os.getenv("MODEL_DIR", "/app/model")
THRESHOLD = float(os.getenv("THRESHOLD", "0.5"))


def _missing(v):
    return v is None or (isinstance(v, float) and math.isnan(v))


class StubModel:
    """Placeholder until the real model lands: squashes the NEWS2 aggregate into 0..1."""

    backend = "stub-news2"
    tree_format = None
    features = list(news2.PARAMS) + ["FiO2"]

    def predict(self, rows: list[dict]) -> list[float]:
        return [1 / (1 + math.exp(-(news2.score(r)[0] - 5))) for r in rows]

    def drivers(self, row: dict) -> list[dict]:
        parts = sorted(news2.components(row).items(), key=lambda kv: kv[1], reverse=True)
        return [{"feature": k, "contribution": float(v)} for k, v in parts[:3]]


class SnapModel:
    backend = "snapml"

    def __init__(self):
        import numpy as np
        from snapml import BoostingMachineClassifier

        self.np = np
        self.features = json.load(open(os.path.join(MODEL_DIR, "features.json")))
        self.impute = json.load(open(os.path.join(MODEL_DIR, "impute.json")))
        self.model = BoostingMachineClassifier()
        self.model.import_model(os.path.join(MODEL_DIR, "model.json"), input_type="xgb_json", tree_format="auto")
        self.tree_format = str(self.model.booster_.optimized_tree_format_)

    def _matrix(self, rows: list[dict]):
        X = [[self.impute[f] if _missing(r.get(f)) else float(r[f]) for f in self.features] for r in rows]
        return self.np.asarray(X, dtype=self.np.float32)

    def predict(self, rows: list[dict]) -> list[float]:
        return self.model.predict_proba(self._matrix(rows), n_jobs=os.cpu_count())[:, 1].tolist()

    def drivers(self, row: dict) -> list[dict]:
        # TODO(ML lead): per-feature contributions (XGBoost pred_contribs) exported alongside the model.
        return []


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
