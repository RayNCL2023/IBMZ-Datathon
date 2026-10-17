"""Differential-privacy-style noise on the leaves a hospital adds before its model leaves the building.

For logistic loss |gradient| <= 1, so one training row can move a leaf value V = -eta * G / (H + lambda)
by at most eta / (1 + lambda) (DPBoost, Li et al., AAAI 2020). Adding Laplace(sensitivity / epsilon) noise to
every leaf of a new tree makes that tree's leaf values epsilon-DP at row level. Rows fall into exactly one
leaf per tree, so the leaves of one tree compose in parallel; trees compose sequentially.

What this does NOT cover (say so in the pitch): split features and thresholds are chosen without noise,
and a patient contributes many hourly rows, so patient-level privacy is weaker than the per-row epsilon.
"""

import json

import numpy as np


def sensitivity(params: dict) -> float:
    return params.get("eta", 0.3) / (1 + params.get("lambda", 1.0))


def perturb(model_json: str, first_tree: int, epsilon: float, params: dict, seed: int) -> str:
    """Add Laplace noise to the leaves of trees [first_tree, end)."""
    m = json.loads(model_json)
    trees = m["learner"]["gradient_booster"]["model"]["trees"]
    rng = np.random.default_rng(seed)
    scale = sensitivity(params) / epsilon
    for tree in trees[first_tree:]:
        leaves = np.flatnonzero(np.array(tree["left_children"]) == -1)
        values = np.array(tree["split_conditions"], dtype=float)
        values[leaves] += rng.laplace(0, scale, len(leaves))
        tree["split_conditions"] = values.tolist()
        # base_weights mirror the leaf values; keep them consistent
        weights = np.array(tree["base_weights"], dtype=float)
        weights[leaves] = values[leaves]
        tree["base_weights"] = weights.tolist()
    return json.dumps(m, separators=(",", ":"))  # Snap ML's parser rejects the default ": " spacing
