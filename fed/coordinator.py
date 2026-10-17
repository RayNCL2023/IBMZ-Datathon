"""Cyclic federated XGBoost: the model travels hospital -> hospital, each adding a few trees on its own data.
The coordinator never sees patient data, only models, metrics and aggregate statistics.

usage:
  python coordinator.py --local                       # simulation: hospitals as in-process objects (laptop)
  python coordinator.py --nodes http://hospital-a:8000 http://hospital-b:8000 ...   # containers
options:
  --targets sepsis hypotension ...   heads to federate (default sepsis)
  --epsilons 10 3 1 0.3              per-tree privacy budgets to sweep (federated without noise always runs)
  --out DIR                          where models, calibrations and report.json go
"""

import argparse
import json
import os
import sys
import time
import urllib.request

import numpy as np

TOTAL_TREES = 150
ROUNDS = 25


class HttpNode:
    def __init__(self, url: str, wait: int = 600):
        self.url = url.rstrip("/")
        for _ in range(wait // 5):  # hospitals load and featurise their data at startup
            try:
                self.name = self._call("name")
                return
            except OSError:
                time.sleep(5)
        raise SystemExit(f"{url} did not come up")

    def _call(self, method: str, **kwargs):
        req = urllib.request.Request(
            f"{self.url}/{method}", data=json.dumps(kwargs).encode(), headers={"content-type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=3600) as resp:
            return json.loads(resp.read())

    def __getattr__(self, method):
        return lambda **kwargs: self._call(method, **kwargs)


def local_nodes():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from node import Hospital

    dl = os.path.expanduser("~/Downloads")
    return [
        Hospital("A", f"{dl}/physionet-sepsis-2019/training/training_setA"),
        Hospital("B", f"{dl}/physionet-sepsis-2019/training/training_setB"),
        Hospital("M", f"{dl}/physionet-2012/training_set2012", f"{dl}/physionet-2012/outcomes2012.csv"),
    ]


def shared_impute(stats: list[dict]) -> list[float]:
    """Row-weighted average of each hospital's local medians: only aggregates cross the wire."""
    out = []
    for i in range(len(stats[0]["median"])):
        vals = [(s["median"][i], s["rows"]) for s in stats if s["median"][i] is not None]
        out.append(sum(v * n for v, n in vals) / sum(n for _, n in vals) if vals else 0.0)
    return out


def evaluate_everywhere(model: str, target: str, nodes) -> dict:
    per = {n.name: n.evaluate(model_json=model, target=target) for n in nodes}
    scored = {k: v for k, v in per.items() if "auroc" in v}
    rows = sum(v["rows"] for v in scored.values())
    mean = sum(v["auroc"] * v["rows"] for v in scored.values()) / rows if rows else None
    return {"per_hospital": per, "mean_auroc": round(mean, 4) if mean else None}


def federate(target: str, nodes, epsilon: float | None, rounds: int, curve: bool = False) -> tuple[str, dict]:
    per_visit = max(1, TOTAL_TREES // (rounds * len(nodes)))
    model, history = None, []
    for r in range(rounds):
        # Alternate the visiting order so the model doesn't drift towards whichever hospital trains last.
        order = list(enumerate(nodes)) if r % 2 == 0 else list(enumerate(nodes))[::-1]
        for i, node in order:
            model = node.train(model_json=model, target=target, trees=per_visit, epsilon=epsilon, seed=r * 100 + i)["model"]
        if curve:
            history.append(evaluate_everywhere(model, target, nodes)["mean_auroc"])
    report = evaluate_everywhere(model, target, nodes)
    report["trees"] = per_visit * rounds * len(nodes)
    report["rounds"] = rounds
    if epsilon:
        trees_per_site = per_visit * rounds
        report["epsilon_per_tree"] = epsilon
        report["epsilon_total_per_site"] = round(epsilon * trees_per_site, 2)  # sequential composition
    if curve:
        report["mean_auroc_by_round"] = history
    return model, report


def centralised(target: str, nodes) -> dict:
    """Simulation-only reference: what pooling everyone's data would give. Impossible across real trusts."""
    import xgboost as xgb
    from node import PARAMS, features, _dump

    parts = [n.train_rows(target) for n in nodes]
    X = np.vstack([p[0] for p in parts])
    y = np.concatenate([p[1] for p in parts])
    booster = xgb.train(PARAMS, xgb.DMatrix(X, label=y, feature_names=features.NAMES), TOTAL_TREES)
    return evaluate_everywhere(_dump(booster), target, nodes)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", action="store_true")
    ap.add_argument("--nodes", nargs="*", default=[])
    ap.add_argument("--targets", nargs="+", default=["sepsis"])
    ap.add_argument("--epsilons", nargs="*", type=float, default=[10, 3, 1, 0.3])
    ap.add_argument("--rounds", type=int, default=ROUNDS, help="cycles through all hospitals (trees per visit = 150 / rounds / hospitals)")
    ap.add_argument("--skip-baselines", action="store_true", help="skip local-only and centralised runs")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
    args = ap.parse_args()

    nodes = local_nodes() if args.local else [HttpNode(u) for u in args.nodes]
    if not nodes:
        sys.exit("give --local or --nodes")
    os.makedirs(args.out, exist_ok=True)

    started = time.time()
    stats = {n.name: n.stats() for n in nodes}
    impute = shared_impute(list(stats.values()))
    for n in nodes:
        n.set_impute(impute=impute)
    json.dump(impute, open(os.path.join(args.out, "impute.json"), "w"))

    report = {"hospitals": {k: {"rows": v["rows"], "events": v["events"]} for k, v in stats.items()}, "targets": {}}
    for target in args.targets:
        members = [n for n in nodes if stats[n.name]["events"][target] > 0]
        print(f"\n== {target}: federating {[n.name for n in members]} ==", flush=True)
        r = {"members": [n.name for n in members], "local_only": {}, "federated": {}}

        for n in [] if args.skip_baselines else members:
            model = n.train(model_json=None, target=target, trees=TOTAL_TREES)["model"]
            r["local_only"][n.name] = evaluate_everywhere(model, target, members)
            print(f"  local-only {n.name}: {r['local_only'][n.name]['mean_auroc']}  {json.dumps({k: v.get('auroc') for k, v in r['local_only'][n.name]['per_hospital'].items()})}", flush=True)

        if args.local and not args.skip_baselines:
            r["centralised"] = centralised(target, members)
            print(f"  centralised (simulation only): {r['centralised']['mean_auroc']}", flush=True)

        for eps in [None] + args.epsilons:
            key = "none" if eps is None else f"{eps:g}"
            model, res = federate(target, members, eps, args.rounds, curve=eps is None)
            r["federated"][key] = res
            calib = {n.name: n.calibrate(model_json=model, target=target) for n in members}
            with open(os.path.join(args.out, f"{target}_eps-{key}.json"), "w") as fh:
                fh.write(model)
            json.dump({k: v for k, v in calib.items() if v}, open(os.path.join(args.out, f"{target}_eps-{key}.calibration.json"), "w"))
            print(f"  federated eps={key}: {res['mean_auroc']}  {json.dumps({k: v.get('auroc') for k, v in res['per_hospital'].items()})}", flush=True)

        report["targets"][target] = r

    report["seconds"] = round(time.time() - started, 1)
    json.dump(report, open(os.path.join(args.out, "report.json"), "w"), indent=2)
    print(f"\ndone in {report['seconds']}s -> {args.out}")


if __name__ == "__main__":
    main()
