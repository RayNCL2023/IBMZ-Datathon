"""Risk model. Uses the real Snap ML model when MODEL_DIR has one, else a NEWS2-based stub.

Export contract (ml/train.py --export writes these into MODEL_DIR):
- heads/<risk>.json  one XGBoost booster per risk (sepsis, hypotension, aki, resp, mortality)
- features.json  ordered feature names; must equal app.features.NAMES
- impute.json    {feature: value}. Snap ML ignores XGBoost's missing-value branches, so we
                 impute identically at train and serve time.
- metrics.json   evaluation per head, incl. each head's operating threshold

Every model scores *histories*: one [T, len(features.RAW)] raw array per patient, scored at its last hour.
"""

import glob
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


def priority(risks: dict[str, float], thresholds: dict[str, float]) -> tuple[float, str]:
    """Rank key for the ward: the head furthest above (or closest to) its own alarm line."""
    ratios = {h: risks[h] / thresholds[h] for h in risks}
    top = max(ratios, key=ratios.get)
    return round(ratios[top], 4), top


class StubModel:
    """Placeholder until real heads land: squashes the NEWS2 aggregate into 0..1 as a 'sepsis' head."""

    backend = "stub-news2"
    tree_format = None
    features = features.NAMES
    metrics = {}
    thresholds = {"sepsis": float(os.getenv("THRESHOLD") or 0.5)}

    def score(self, histories: list[np.ndarray]) -> list[dict]:
        F = _last_rows(histories)
        out = []
        for row in F:
            risk = 1 / (1 + math.exp(-(row[features.NAMES.index("NEWS2")] - 5)))
            parts = news2.components(dict(zip(features.RAW, row[: len(features.RAW)].tolist())))
            top = sorted(parts.items(), key=lambda kv: kv[1], reverse=True)[:3]
            drivers = [{"feature": k, "contribution": float(v)} for k, v in top if v > 0]
            out.append({"sepsis": {"risk": risk, "alert": risk >= self.thresholds["sepsis"], "drivers": drivers}})
        return out


class SnapModel:
    """One Snap ML booster per risk head (heads/<name>.json), sharing features and imputation."""

    backend = "snapml"

    def __init__(self):
        from snapml import BoostingMachineClassifier

        names = json.load(open(os.path.join(MODEL_DIR, "features.json")))
        if names != features.NAMES:
            raise ValueError("features.json does not match app.features.NAMES; re-export the model")

        self.features = names
        impute = json.load(open(os.path.join(MODEL_DIR, "impute.json")))
        self.impute = np.array([impute[f] for f in names], dtype=np.float32)
        self.metrics = json.load(open(os.path.join(MODEL_DIR, "metrics.json")))

        self.heads, self.thresholds = {}, {}
        for path in sorted(glob.glob(os.path.join(MODEL_DIR, "heads", "*.json"))):
            head = os.path.basename(path)[:-5]
            booster = BoostingMachineClassifier()
            booster.import_model(path, input_type="xgb_json", tree_format="auto")
            booster.set_params(n_jobs=os.cpu_count())
            self.heads[head] = booster
            self.thresholds[head] = float(self.metrics["heads"][head]["threshold"])
        if not self.heads:
            raise ValueError("no heads/*.json in MODEL_DIR")
        self.tree_format = str(next(iter(self.heads.values())).booster_.optimized_tree_format_)

        groups = {}
        for i, name in enumerate(names):
            groups.setdefault(_group(name), []).append(i)
        self.groups = {g: idx for g, idx in groups.items() if g not in NOT_DRIVERS}

    def score(self, histories: list[np.ndarray]) -> list[dict]:
        F = _last_rows(histories)
        F = np.where(np.isnan(F), self.impute, F).astype(np.float32)

        # Drivers by occlusion: reset one clinical variable (all its features) to the population value
        # and see how far each risk falls. The real rows and all occluded copies go to the
        # accelerator in one batch per head.
        names = list(self.groups)
        occluded = np.repeat(F, len(names), axis=0)
        for j, g in enumerate(names):
            occluded[j :: len(names), self.groups[g]] = self.impute[self.groups[g]]
        batch = np.vstack([F, occluded])

        out = [{} for _ in range(len(F))]
        for head, booster in self.heads.items():
            p = booster.predict_proba(batch)[:, 1]
            probs, drops = p[: len(F)], p[: len(F), None] - p[len(F) :].reshape(len(F), len(names))
            for i in range(len(F)):
                top = np.argsort(-drops[i])[:3]
                out[i][head] = {
                    "risk": round(float(probs[i]), 4),
                    "alert": bool(probs[i] >= self.thresholds[head]),
                    "drivers": [
                        {"feature": names[j], "contribution": round(float(drops[i, j]), 4)}
                        for j in top
                        if drops[i, j] > 0
                    ],
                }
        return out


def load():
    if not glob.glob(os.path.join(MODEL_DIR, "heads", "*.json")):
        return StubModel()

    try:
        return SnapModel()
    except Exception as e:  # keep the demo alive if the export is broken
        print(f"!! failed to load Snap ML heads, using stub: {e}", file=sys.stderr)
        return StubModel()


def platform_info() -> dict:
    return {"arch": platform.machine(), "byteorder": sys.byteorder}
