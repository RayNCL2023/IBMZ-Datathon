"""Load every source, build features with the API's own code and all risk labels, cache to ml/cache/data.npz.

Sources (site codes):
  A, B  PhysioNet 2019 sepsis challenge, hospitals A and B   (sepsis, hypotension, aki, resp)
  M     PhysioNet 2012 challenge, first 48h of ICU stays     (hypotension, aki, mortality; no SpO2 so no resp)
  C     eICU demo, 20+ US hospitals: external test only      (everything it has)

usage: .venv/bin/python prepare.py
"""

import csv
import glob
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

import labels

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from app import features  # noqa: E402

DL = os.path.expanduser("~/Downloads")
SOURCES = {
    "A": (f"{DL}/physionet-sepsis-2019/training/training_setA", None),
    "B": (f"{DL}/physionet-sepsis-2019/training/training_setB", None),
    "M": (f"{DL}/physionet-2012/training_set2012", f"{DL}/physionet-2012/outcomes2012.csv"),
    "C": (f"{DL}/eicu-crd-demo/training_setC", f"{DL}/eicu-crd-demo/outcomes_eicu.csv"),
}
TARGETS = ["sepsis", "hypotension", "aki", "resp", "mortality"]
OUT = os.path.join(os.path.dirname(__file__), "cache", "data.npz")


def _deaths(path: str | None) -> dict[str, float]:
    if not path or not os.path.exists(path):
        return {}
    with open(path) as fh:
        return {r["patient"]: float(r["in_hospital_death"]) for r in csv.DictReader(fh) if r["in_hospital_death"] != ""}


def load(job):
    path, death = job
    with open(path) as fh:
        header = fh.readline().strip().split("|")
        body = np.genfromtxt(fh, delimiter="|", dtype=float, ndmin=2)
    col = lambda name: body[:, header.index(name)] if name in header else np.full(len(body), np.nan)

    raw = np.column_stack([col(c) for c in features.RAW])
    sepsis = col("SepsisLabel")
    has_spo2 = not np.all(np.isnan(col("O2Sat")))
    y = {
        "sepsis": np.where(np.isnan(sepsis), -1, sepsis).astype(np.int8),
        "hypotension": labels.hypotension(col("MAP")),
        "aki": labels.aki(col("Creatinine")),
        "resp": labels.resp(col("O2Sat"), col("FiO2")) if has_spo2 else np.full(len(body), -1, np.int8),
        "mortality": np.full(len(body), -1 if death is None else int(death), np.int8),
    }
    return features.patient_features(raw).astype(np.float32), y


def main():
    jobs, site, patients = [], [], []
    for code, (folder, outcomes) in SOURCES.items():
        paths = sorted(glob.glob(os.path.join(folder, "*.psv")))
        if not paths:
            print(f"skip {code}: no files in {folder}")
            continue

        deaths = _deaths(outcomes)
        for p in paths:
            name = os.path.basename(p)[:-4]
            jobs.append((p, deaths.get(name)))
            site.append(code)
            patients.append(f"{os.path.basename(folder)}/{name}")
        print(f"{code}: {len(paths)} patients")

    with ProcessPoolExecutor() as pool:
        results = list(pool.map(load, jobs, chunksize=64))

    lengths = [len(r[0]) for r in results]
    out = {
        "X": np.concatenate([r[0] for r in results]),
        "pid": np.repeat(np.arange(len(results), dtype=np.int32), lengths),
        "hour": np.concatenate([np.arange(n, dtype=np.int16) for n in lengths]),
        "site": np.array(site),
        "patients": np.array(patients),
        "names": np.array(features.NAMES),
    }
    for t in TARGETS:
        out[f"y_{t}"] = np.concatenate([r[1][t] for r in results])

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    np.savez(OUT, **out)
    print(f"{len(results)} patients, {len(out['X'])} rows, {out['X'].shape[1]} features -> {OUT}")
    patient_site = out["site"][out["pid"]]
    for t in TARGETS:
        y = out[f"y_{t}"]
        events = {s: len(np.unique(out["pid"][(y == 1) & (patient_site == s)])) for s in SOURCES}
        print(f"  {t:9} labelled rows {np.mean(y >= 0):5.1%}  positive rows {np.mean(y == 1):5.2%}  patients with event {events}")


if __name__ == "__main__":
    main()
