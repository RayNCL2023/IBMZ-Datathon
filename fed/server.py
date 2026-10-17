"""HTTP wrapper around one Hospital. Only reachable on the private federation network (no published port).

env: HOSPITAL (name), DATA_DIR (that hospital's .psv files only), OUTCOMES (optional csv)
"""

import os

from fastapi import Body, FastAPI

from node import Hospital

hospital = Hospital(os.environ["HOSPITAL"], os.environ.get("DATA_DIR", "/data"), os.environ.get("OUTCOMES"))
app = FastAPI(title=f"hospital {hospital.name}")


@app.post("/name")
def name():
    return hospital.name


@app.post("/stats")
def stats():
    return hospital.stats()


@app.post("/set_impute")
def set_impute(impute: list[float] = Body(..., embed=True)):
    hospital.set_impute(impute)
    return {"ok": True}


@app.post("/train")
def train(
    target: str = Body(...),
    trees: int = Body(...),
    model_json: str | None = Body(None),
    epsilon: float | None = Body(None),
    seed: int = Body(0),
):
    return hospital.train(model_json, target, trees, epsilon, seed)


@app.post("/evaluate")
def evaluate(model_json: str = Body(...), target: str = Body(...)):
    return hospital.evaluate(model_json, target)


@app.post("/calibrate")
def calibrate(model_json: str = Body(...), target: str = Body(...)):
    return hospital.calibrate(model_json, target)
