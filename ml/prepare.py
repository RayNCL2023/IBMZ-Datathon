"""Load every PhysioNet 2019 patient, build features with the API's own code, cache to ml/cache/data.npz.

usage: .venv/bin/python prepare.py [DATA_DIR]   (default ~/Downloads/physionet-sepsis-2019/training)
"""

import glob
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from app import features  # noqa: E402

DATA_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Downloads/physionet-sepsis-2019/training")
OUT = os.path.join(os.path.dirname(__file__), "cache", "data.npz")


def load(path: str):
    with open(path) as fh:
        header = fh.readline().strip().split("|")
        body = np.genfromtxt(fh, delimiter="|", dtype=float, ndmin=2)
    cols = [header.index(c) for c in features.RAW]
    raw = body[:, cols]
    return features.patient_features(raw).astype(np.float32), body[:, header.index("SepsisLabel")].astype(np.int8)


def main():
    paths = sorted(glob.glob(os.path.join(DATA_DIR, "training_set*", "*.psv")))
    if not paths:
        sys.exit(f"no .psv files under {DATA_DIR}")

    with ProcessPoolExecutor() as pool:
        results = list(pool.map(load, paths, chunksize=64))

    X = np.concatenate([r[0] for r in results])
    y = np.concatenate([r[1] for r in results])
    pid = np.concatenate([np.full(len(r[1]), i, dtype=np.int32) for i, r in enumerate(results)])
    hour = np.concatenate([np.arange(len(r[1]), dtype=np.int16) for r in results])
    hospital = np.array(["A" if "setA" in p else "B" for p in paths])
    patients = np.array([os.path.basename(p)[:-4] for p in paths])

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    np.savez(OUT, X=X, y=y, pid=pid, hour=hour, hospital=hospital, patients=patients, names=np.array(features.NAMES))
    print(f"{len(paths)} patients, {X.shape[0]} rows, {X.shape[1]} features -> {OUT}")


if __name__ == "__main__":
    main()
