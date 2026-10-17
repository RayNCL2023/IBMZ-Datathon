"""Risk model. Uses the real Snap ML model when MODEL_DIR has one, else a NEWS2-based stub.

Export contract (ml/train.py --export writes these into MODEL_DIR):
- heads/<risk>.json  one XGBoost booster per risk (sepsis, hypotension, aki, resp, mortality)
- features.json  ordered feature names; must equal app.features.NAMES
- impute.json    {feature: value}. Snap ML ignores XGBoost's missing-value branches, so we
                 impute identically at train and serve time.
- metrics.json   evaluation per head vs NEWS2 and a one-signal baseline
- calibration.json  per head and site: isotonic map raw score -> probability, and the alarm threshold
- fatigue.json   alarm load vs events caught per head, on held-out patients (ml/fatigue.py)

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
# auto = NNPA (zdnn_tensors) when present; compress_trees = CPU, which api/bench.py measured ~5x faster for these heads.
TREE_FORMAT = os.getenv("TREE_FORMAT") or "auto"

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


def priority(risks: dict[str, dict]) -> tuple[float, str]:
    """Rank key for the ward: the head furthest above (or closest to) its own alarm line."""
    ratios = {h: r["risk"] / max(r["threshold"], 1e-6) for h, r in risks.items()}
    top = max(ratios, key=ratios.get)
    return round(ratios[top], 4), top


class StubModel:
    """Placeholder until real heads land: squashes the NEWS2 aggregate into 0..1 as a 'sepsis' head."""

    backend = "stub-news2"
    tree_format = None
    features = features.NAMES
    metrics = {}
    fatigue = {}
    thresholds = {"sepsis": float(os.getenv("THRESHOLD") or 0.5)}

    privacy = {}
    privacy_report = {}

    def score(self, histories: list[np.ndarray], sites: list[str | None], privacy: str | None = None) -> list[dict]:
        return self.score_features(_last_rows(histories), sites, privacy)

    def score_features(self, F: np.ndarray, sites: list, privacy: str | None = None, drivers: bool = True) -> list[dict]:
        out = []
        threshold = self.thresholds["sepsis"]
        for row in F:
            risk = 1 / (1 + math.exp(-(row[features.NAMES.index("NEWS2")] - 5)))
            parts = news2.components(dict(zip(features.RAW, row[: len(features.RAW)].tolist())))
            top = sorted(parts.items(), key=lambda kv: kv[1], reverse=True)[:3]
            r = {"risk": risk, "alert": risk >= threshold, "threshold": threshold}
            if drivers:
                r["drivers"] = [{"feature": k, "contribution": float(v)} for k, v in top if v > 0]
            out.append({"sepsis": r})
        return out


class SnapModel:
    """One Snap ML booster per risk head (heads/<name>.json), sharing features and imputation."""

    backend = "snapml"
    privacy_report = {}

    def __init__(self):
        from snapml import BoostingMachineClassifier

        names = json.load(open(os.path.join(MODEL_DIR, "features.json")))
        if names != features.NAMES:
            raise ValueError("features.json does not match app.features.NAMES; re-export the model")

        self.features = names
        impute = json.load(open(os.path.join(MODEL_DIR, "impute.json")))
        self.impute = np.array([impute[f] for f in names], dtype=np.float32)
        self.metrics = json.load(open(os.path.join(MODEL_DIR, "metrics.json")))
        fatigue = os.path.join(MODEL_DIR, "fatigue.json")
        self.fatigue = json.load(open(fatigue)) if os.path.exists(fatigue) else {}
        # {head: {site: {x, y, raw_threshold, threshold}}}; "global" is the fallback for unknown sites.
        self.calibration = json.load(open(os.path.join(MODEL_DIR, "calibration.json")))

        self.heads, self.thresholds = {}, {}
        for path in sorted(glob.glob(os.path.join(MODEL_DIR, "heads", "*.json"))):
            head = os.path.basename(path)[:-5]
            booster = BoostingMachineClassifier()
            booster.import_model(path, input_type="xgb_json", tree_format=TREE_FORMAT)
            booster.set_params(n_jobs=os.cpu_count())
            self.heads[head] = booster
            self.thresholds[head] = float(self.calibration[head]["global"]["threshold"])
        if not self.heads:
            raise ValueError("no heads/*.json in MODEL_DIR")
        self.tree_format = str(next(iter(self.heads.values())).booster_.optimized_tree_format_)
        try:
            self._load_privacy_variants(BoostingMachineClassifier)
        except Exception as e:  # the privacy slider is optional; never take the main heads down with it
            print(f"!! privacy variants not loaded: {e}", file=sys.stderr)
            self.privacy = {}

        groups = {}
        for i, name in enumerate(names):
            groups.setdefault(_group(name), []).append(i)
        self.groups = {g: idx for g, idx in groups.items() if g not in NOT_DRIVERS}

    def _load_privacy_variants(self, BoostingMachineClassifier):
        """Federated sepsis models (fed/coordinator.py), one per privacy budget, each with the hospitals' own
        calibrations and the federation's shared imputation. Selected per request with privacy=<epsilon>."""
        self.privacy = {}
        fed = os.path.join(MODEL_DIR, "fed")
        if not os.path.isdir(fed):
            return

        impute = np.array(json.load(open(os.path.join(fed, "impute.json"))), dtype=np.float32)
        self.privacy_report = json.load(open(os.path.join(fed, "report.json")))
        for path in sorted(glob.glob(os.path.join(fed, "sepsis_eps-*.json"))):
            if path.endswith(".calibration.json"):
                continue
            key = os.path.basename(path)[len("sepsis_eps-") : -5]
            booster = BoostingMachineClassifier()
            booster.import_model(path, input_type="xgb_json", tree_format=TREE_FORMAT)
            booster.set_params(n_jobs=os.cpu_count())
            calibration = json.load(open(path[:-5] + ".calibration.json"))
            self.privacy[key] = (booster, impute, calibration)

    def _score_head(
        self, booster, F: np.ndarray, impute: np.ndarray, calibration: dict, sites: list, drivers: bool = True
    ) -> list[dict]:
        """Calibrated risk, alert and drivers for one head. Drivers by occlusion: reset one clinical variable
        (all its features) to the population value and see how far the risk falls. The real rows and all
        occluded copies go to the accelerator in one batch."""
        F = np.where(np.isnan(F), impute, F).astype(np.float32)
        names = list(self.groups) if drivers else []
        occluded = np.repeat(F, len(names), axis=0)
        for j, g in enumerate(names):
            occluded[j :: len(names), self.groups[g]] = impute[self.groups[g]]
        raw = booster.predict_proba(np.vstack([F, occluded]))[:, 1]

        fallback = calibration.get("global") or calibration[sorted(calibration)[0]]
        out = []
        for i in range(len(F)):
            cal = calibration.get(sites[i] or "global", fallback)
            risk = float(np.interp(raw[i], cal["x"], cal["y"]))
            occ = np.interp(raw[len(F) + i * len(names) : len(F) + (i + 1) * len(names)], cal["x"], cal["y"])
            drop = risk - occ
            top = np.argsort(-drop)[:3]
            r = {"risk": round(risk, 4), "alert": bool(raw[i] >= cal["raw_threshold"]), "threshold": cal["threshold"]}
            if drivers:
                r["drivers"] = [
                    {"feature": names[j], "contribution": round(float(drop[j]), 4)} for j in top if drop[j] > 0
                ]
            out.append(r)
        return out

    def score(self, histories: list[np.ndarray], sites: list[str | None], privacy: str | None = None) -> list[dict]:
        """Risks are calibrated probabilities for the patient's site; alerts use that site's alarm threshold.
        privacy=<epsilon> swaps the sepsis head for the federated model trained with that privacy budget."""
        return self.score_features(_last_rows(histories), sites, privacy)

    def score_features(self, F: np.ndarray, sites: list, privacy: str | None = None, drivers: bool = True) -> list[dict]:
        """Like score(), for feature rows already built (e.g. every hour of one stay for the timeline)."""
        out = [{} for _ in range(len(F))]
        for head, booster in self.heads.items():
            impute, calibration = self.impute, self.calibration[head]
            if head == "sepsis" and privacy in self.privacy:
                booster, impute, calibration = self.privacy[privacy]
            for i, r in enumerate(self._score_head(booster, F, impute, calibration, sites, drivers)):
                out[i][head] = r
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
