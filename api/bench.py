"""Inference benchmark: the same exported heads on the NNPA AI accelerator vs the CPU.

  snapml-nnpa  Snap ML, tree_format=zdnn_tensors (IBM z16/z17 Integrated Accelerator for AI)
  snapml-cpu   Snap ML, tree_format=compress_trees (CPU)
  xgboost-cpu  plain XGBoost on the CPU (only where xgboost is installed, e.g. the mfc-fed image)

usage (on LinuxONE):
  sudo docker compose exec -T api python - < bench.py                   # Snap ML backends
  sudo docker run --rm -i -v ~/mfc/api/model:/app/model:ro mfc-fed python3 - < ~/mfc/api/bench.py   # XGBoost
Rows come from parity.npz (held-out, already imputed), tiled up to the batch size. Prints JSON lines and
writes model/benchmark-<backend>.json when the model dir is writable.
"""

import glob
import json
import os
import platform
import time

import numpy as np

MODEL_DIR = os.getenv("MODEL_DIR", "/app/model")
BATCHES = [1, 12, 100, 1_000, 10_000, 100_000]
BUDGET_S = 2.0  # time per (backend, head, batch) measurement


def timed(predict, X):
    predict(X)  # warm-up
    runs, started = 0, time.perf_counter()
    while True:
        predict(X)
        runs += 1
        elapsed = time.perf_counter() - started
        if elapsed >= BUDGET_S or runs >= 2000:
            return elapsed / runs


def backends():
    try:
        from snapml import BoostingMachineClassifier

        for name, fmt in (("snapml-nnpa", "zdnn_tensors"), ("snapml-cpu", "compress_trees")):
            def load(path, fmt=fmt):
                m = BoostingMachineClassifier()
                m.import_model(path, input_type="xgb_json", tree_format=fmt)
                m.set_params(n_jobs=os.cpu_count())
                got = str(m.booster_.optimized_tree_format_)
                return (lambda X: m.predict_proba(X)[:, 1]), got
            yield name, load
    except ImportError:
        pass
    try:
        import xgboost as xgb

        def load(path):
            b = xgb.Booster(model_file=path)
            b.set_param({"nthread": os.cpu_count()})
            return (lambda X: b.inplace_predict(X)), f"xgboost {xgb.__version__}"
        yield "xgboost-cpu", load
    except ImportError:
        pass


def main():
    parity = np.load(os.path.join(MODEL_DIR, "parity.npz"))
    base = parity["X"].astype(np.float32)
    heads = sorted(glob.glob(os.path.join(MODEL_DIR, "heads", "*.json")))
    for backend, load in backends():
        report = {"backend": backend, "arch": platform.machine(), "cpus": os.cpu_count(), "heads": {}}
        for path in heads:
            head = os.path.basename(path)[:-5]
            predict, fmt = load(path)
            diff = float(np.max(np.abs(predict(base) - parity[head]))) if head in parity else None
            r = {"tree_format": fmt, "max_abs_diff_vs_xgboost_export": diff, "batches": {}}
            for n in BATCHES:
                X = np.resize(base, (n, base.shape[1]))
                s = timed(predict, X)
                r["batches"][n] = {"latency_ms": round(s * 1000, 4), "rows_per_s": round(n / s)}
            report["heads"][head] = r
            print(json.dumps({"backend": backend, "head": head, **r}), flush=True)
        try:
            json.dump(report, open(os.path.join(MODEL_DIR, f"benchmark-{backend}.json"), "w"), indent=1)
        except OSError:
            pass


if __name__ == "__main__":
    main()
