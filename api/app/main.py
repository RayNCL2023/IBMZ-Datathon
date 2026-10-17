"""Sepsis early-warning API (runs on LinuxONE). Contract: see DATATHON_GUIDE.md §7."""

import json
import os
import time

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from . import features, handover, keys
from . import model as risk_model
from . import news2
from .ward import VITALS, Ward

MODEL_VERSION = os.getenv("MODEL_VERSION", "dev")

# No public /docs or /openapi.json: the API contract lives in the repo, not on the open internet.
app = FastAPI(title="Sepsis early warning", version=MODEL_VERSION, docs_url=None, redoc_url=None, openapi_url=None)
model = risk_model.load()
ward = Ward()


def require_key(x_api_key: str = Header(default="")):
    """Every endpoint except /health. Keys live in SQLite (app/keys.py); no keys means nobody gets in."""
    if not keys.verify(x_api_key):
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


@app.get("/benchmark", dependencies=[Depends(require_key)])
def benchmark():
    """Same heads on NNPA vs CPU (api/bench.py), measured on this LinuxONE VM: latency and rows/s per batch size."""
    path = os.path.join(risk_model.MODEL_DIR, "benchmark.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="no benchmark yet; run api/bench.py")
    return json.load(open(path))


@app.get("/fatigue", dependencies=[Depends(require_key)])
def fatigue():
    """Alarm load vs events caught per head on held-out patients, model threshold sweep vs NEWS2 cut-offs."""
    return {"heads": model.fatigue}


@app.get("/patient/{patient_id}", dependencies=[Depends(require_key)])
def patient(patient_id: str, hour: int | None = None, privacy: str | None = None):
    """Every hour of one ward patient's stay (up to `hour`, so a replay never shows the future): all risks
    and NEWS2 per hour, first alarm per head vs NEWS2, and drivers at the last hour."""
    found = ward.find(patient_id)
    if not found:
        raise HTTPException(status_code=404, detail="unknown patient")
    if privacy and privacy not in model.privacy:
        raise HTTPException(status_code=400, detail=f"privacy must be one of {sorted(model.privacy)}")
    if hour is not None and hour < 0:
        raise HTTPException(status_code=400, detail="hour must be >= 0")

    bed, p = found
    end = len(p["rows"]) if hour is None else min(hour, len(p["rows"]) - 1) + 1
    F = features.patient_features(p["raw"])[:end]
    sites = [p["hospital"]] * end
    risks = model.score_features(F, sites, privacy, drivers=False)
    last = model.score_features(F[-1:], sites[-1:], privacy)[0]

    timeline = []
    for h, (row, rs) in enumerate(zip(p["rows"][:end], risks)):
        score, alert = news2.score(row)
        ratio, top = risk_model.priority(rs)
        timeline.append({
            "hour": h,
            "risks": {k: {"risk": v["risk"], "alert": v["alert"]} for k, v in rs.items()},
            "priority": ratio,
            "topRisk": top,
            "news2": score,
            "news2Alert": alert,
            "vitals": {k: row.get(k) for k in VITALS},
        })

    labels = [int(r.get("SepsisLabel") or 0) for r in p["rows"]]
    first = lambda flags: next((t["hour"] for t, f in zip(timeline, flags) if f), None)
    return {
        "patientId": p["id"],
        "hospital": p["hospital"],
        "bed": bed + 1,
        "lengthOfStay": len(p["rows"]),
        # PhysioNet 2019 labels start 6h before sepsis was clinically recognised.
        "sepsisOnset": labels.index(1) + 6 if 1 in labels else None,
        "thresholds": {k: v["threshold"] for k, v in last.items()},
        "firstAlert": {k: first([t["risks"][k]["alert"] for t in timeline]) for k in last},
        "news2FirstAlert": first([t["news2Alert"] for t in timeline]),
        "timeline": timeline,
        "drivers": {k: v["drivers"] for k, v in last.items()},
    }


_handovers: dict[tuple, dict] = {}


@app.post("/handover/{patient_id}", dependencies=[Depends(require_key)])
def handover_note(patient_id: str, hour: int | None = None, privacy: str | None = None):
    """SBAR handover note for one ward patient at a replay hour. `sbar` is built by rules from the data;
    `narrative` is Granite (on LinuxONE, ~15 s) summarising it, with any number not in the facts flagged.
    Cached per patient, hour and privacy setting."""
    p = patient(patient_id, hour, privacy)
    key = (patient_id, p["timeline"][-1]["hour"], privacy)
    if key in _handovers:
        return {**_handovers[key], "cached": True}

    _, raw = ward.find(patient_id)
    sbar = handover.facts(p, raw["rows"][p["timeline"][-1]["hour"]])
    out = {"patientId": patient_id, "hour": key[1], "sbar": sbar, **handover.narrate(sbar)}
    if out.get("narrative"):
        _handovers[key] = out
    return {**out, "cached": False}


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
