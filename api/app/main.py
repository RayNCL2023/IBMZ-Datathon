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


def _score(histories: list) -> dict:
    probs, drivers = model.score(histories)
    return {
        "probabilities": probs,
        "alert": [p >= model.threshold for p in probs],
        "threshold": model.threshold,
        "drivers": drivers,
    }


@app.get("/health")
def health():
    return {
        **risk_model.platform_info(),
        "backend": model.backend,
        "tree_format": model.tree_format,
        "n_features": len(model.features),
        "model_version": MODEL_VERSION,
        "threshold": model.threshold,
        "test_auroc": model.metrics.get("test", {}).get("AB", {}).get("model", {}).get("auroc"),
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
    out = _score(histories)
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
    """Held-out evaluation vs NEWS2, per hospital (from ml/train.py)."""
    return model.metrics


@app.get("/ward", dependencies=[Depends(require_key)])
def ward_at(hour: int = 0):
    if hour < 0:
        raise HTTPException(status_code=400, detail="hour must be >= 0")

    beds = ward.at(hour)
    if not beds:
        return {"hour": hour, "beds": []}

    scored = _score([b.pop("history") for b in beds])
    for i, bed in enumerate(beds):
        row = bed.pop("row")
        bed["news2"], bed["news2Alert"] = news2.score(row)
        bed["risk"] = scored["probabilities"][i]
        bed["alert"] = scored["alert"][i]
        bed["drivers"] = scored["drivers"][i]
    return {"hour": hour, "threshold": scored["threshold"], "beds": beds}
