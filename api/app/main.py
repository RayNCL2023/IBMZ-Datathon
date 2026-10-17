"""Sepsis early-warning API (runs on LinuxONE). Contract: see DATATHON_GUIDE.md §7."""

import os
import time

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from . import features
from . import model as risk_model
from . import news2
from .ward import Ward

API_KEY = os.getenv("API_KEY", "")
MODEL_VERSION = os.getenv("MODEL_VERSION", "dev")

app = FastAPI(title="Sepsis early warning", version=MODEL_VERSION)
model = risk_model.load()
ward = Ward()


def require_key(x_api_key: str = Header(default="")):
    if not API_KEY:
        return
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="invalid api key")


class Rows(BaseModel):
    rows: list[dict[str, float | None]] = []
    # Optional: one list of hourly rows per patient, oldest first, scored at the last hour.
    # Without history, each row is scored as a patient's first hour (trend features are empty).
    history: list[list[dict[str, float | None]]] | None = None
    # Site whose calibration and alarm thresholds to use (A, B, M, C); unknown or empty = pooled "global".
    site: str | None = None
    # Privacy budget of the federated sepsis model to use (see /privacy); empty = centrally trained model.
    privacy: str | None = None


def _score(histories: list, sites: list[str | None], privacy: str | None = None) -> dict:
    """Every head for every patient, plus a priority to rank by. Top-level sepsis fields kept for old clients."""
    risks = model.score(histories, sites, privacy)
    priority = [risk_model.priority(rs) for rs in risks]
    out = {
        "risks": risks,
        "thresholds": model.thresholds,
        "priority": [p for p, _ in priority],
        "topRisk": [h for _, h in priority],
    }
    if "sepsis" in model.thresholds:
        out["probabilities"] = [rs["sepsis"]["risk"] for rs in risks]
        out["alert"] = [rs["sepsis"]["alert"] for rs in risks]
        out["drivers"] = [rs["sepsis"]["drivers"] for rs in risks]
        out["threshold"] = risks[0]["sepsis"]["threshold"] if risks else model.thresholds["sepsis"]
    return out


@app.get("/health")
def health():
    return {
        **risk_model.platform_info(),
        "backend": model.backend,
        "tree_format": model.tree_format,
        "n_features": len(model.features),
        "model_version": MODEL_VERSION,
        "heads": list(model.thresholds),
        "test_auroc": {
            h: r.get("test", {}).get("all", {}).get("model", {}).get("auroc")
            for h, r in model.metrics.get("heads", {}).items()
        },
        "ward_beds": len(ward.patients),
    }


@app.post("/predict", dependencies=[Depends(require_key)])
def predict(body: Rows):
    started = time.perf_counter()
    if not body.rows and not body.history:
        raise HTTPException(status_code=400, detail="send rows or history")

    histories = [features.rows_to_raw(h) for h in body.history] if body.history else [
        features.rows_to_raw([r]) for r in body.rows
    ]
    out = _score(histories, [body.site] * len(histories), body.privacy)
    out["latency_ms"] = round((time.perf_counter() - started) * 1000, 3)
    return out


@app.post("/news2", dependencies=[Depends(require_key)])
def news2_scores(body: Rows):
    results = [news2.score(r) for r in body.rows]
    return {
        "scores": [s for s, _ in results],
        "alert": [a for _, a in results],
        "components": [news2.components(r) for r in body.rows],
    }


@app.get("/metrics", dependencies=[Depends(require_key)])
def metrics():
    """Held-out evaluation of every head vs NEWS2 and a one-signal baseline, per site (from ml/train.py)."""
    return model.metrics


@app.get("/privacy", dependencies=[Depends(require_key)])
def privacy():
    """Federated sepsis models by privacy budget, with held-out AUROC per hospital, for the dashboard slider.
    "none" = federated without noise; local_only = each hospital alone; epsilon is per tree (row level)."""
    report = model.privacy_report.get("targets", {}).get("sepsis", {})
    return {
        "options": sorted(model.privacy, key=lambda k: -float("inf") if k == "none" else -float(k)),
        "federated": report.get("federated", {}),
        "local_only": report.get("local_only", {}),
        "hospitals": model.privacy_report.get("hospitals", {}),
    }


@app.get("/ward", dependencies=[Depends(require_key)])
def ward_at(hour: int = 0, privacy: str | None = None):
    if hour < 0:
        raise HTTPException(status_code=400, detail="hour must be >= 0")

    beds = ward.at(hour)
    if not beds:
        return {"hour": hour, "beds": []}

    if privacy and privacy not in model.privacy:
        raise HTTPException(status_code=400, detail=f"privacy must be one of {sorted(model.privacy)}")
    scored = _score([b.pop("history") for b in beds], [b["hospital"] for b in beds], privacy)
    for i, bed in enumerate(beds):
        row = bed.pop("row")
        bed["news2"], bed["news2Alert"] = news2.score(row)
        bed["risks"] = scored["risks"][i]
        bed["priority"] = scored["priority"][i]
        bed["topRisk"] = scored["topRisk"][i]
        sepsis = bed["risks"].get("sepsis", {})
        bed["risk"], bed["alert"], bed["drivers"] = sepsis.get("risk"), sepsis.get("alert"), sepsis.get("drivers")
    return {"hour": hour, "privacy": privacy, "thresholds": scored["thresholds"], "beds": beds}
