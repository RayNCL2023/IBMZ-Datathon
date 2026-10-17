# Federated training with a privacy dial

Hospitals never share patient data. A sepsis model travels between hospital containers ("cyclic" federated XGBoost, the same idea as NVIDIA FLARE's cyclic mode). Each hospital adds a few trees on its own data, then passes the model on. The coordinator only ever sees three things:
- models
- held-out metrics
- feature medians, which are averaged to give a shared imputation

| File | Role |
|---|---|
| `node.py` | One hospital. Loads only its own `.psv` files, splits patients 70/15/15 locally, trains, evaluates and calibrates on request. |
| `server.py` | HTTP wrapper around a node (FastAPI). |
| `coordinator.py` | Runs the federation. `--local` simulates the hospitals in one process; `--nodes URL...` drives real containers. |
| `dp.py` | Laplace noise on the leaves a hospital adds, before the model leaves the building. |
| `docker-compose.yml` | Hospitals A, B and M (PhysioNet 2012), each mounting only its own data read-only, on an **internal** Docker network (no internet, no published ports). |

## Run on LinuxONE

```bash
cd ~/mfc && sudo docker compose -f fed/docker-compose.yml up -d --build hospital-a hospital-b hospital-m
sudo docker compose -f fed/docker-compose.yml --profile run run --rm coordinator   # ~3 min on 3 cores
cp fed/out/* api/model/fed/ && cd api && sudo docker compose restart              # serves the privacy slider
```

The hospital containers run Ubuntu's `python3-xgboost` 2.0.3, which is built for s390x. The API then serves the resulting models with Snap ML on NNPA.

## Results (sepsis, held-out patients at each hospital, run on LinuxONE)

| Model | Hospital A | Hospital B | Mean |
|---|---|---|---|
| A alone | 0.829 | 0.760 | 0.795 |
| B alone | 0.785 | 0.876 | 0.830 |
| **Federated, no noise** | 0.817 | 0.867 | **0.842** |
| Federated, ε = 10 per tree | 0.819 | 0.868 | 0.843 |
| Federated, ε = 3 | 0.816 | 0.870 | 0.842 |
| Federated, ε = 1 | 0.808 | 0.867 | 0.837 |
| Federated, ε = 0.3 | 0.775 | 0.796 | 0.785 |
| Centralised (pooled data; simulation only) | 0.827 | 0.871 | 0.848 |

Hypotension and AKI were also federated across A, B and M in simulation:

| Risk | Federated | Centralised |
|---|---|---|
| Hypotension | 0.862 | 0.864 |
| AKI | 0.804 | 0.822 |

The headline: a hospital's own model collapses on another hospital's patients (A's model scores 0.760 on B). The federated model works for both, close to what pooling the data would give, and no data moves.

## What the privacy dial does and does not promise

- For logistic loss, one training row moves a leaf by at most η/(1+λ) (DPBoost, Li et al., AAAI 2020). Laplace(sensitivity/ε) noise on every new leaf makes each tree's leaf values ε-DP **at row level**.
- **Composition is sequential across trees.** With 75 trees per hospital, ε=1 per tree adds up to ε=75 per hospital: a weak formal guarantee.
- **Split features and thresholds are not noised.**
- **A patient contributes many hourly rows,** so patient-level privacy is weaker than the row-level ε.

Pitch it as a demonstration of the privacy/accuracy trade-off, not a certified guarantee.

## Known limitation

Cyclic training slightly favours the larger or last-visited site. Hospital A's federated score (0.817) is a little below its own model's (0.829), even though centralised training matches A's own model. Alternating the visiting order and using smaller turns did not close the gap. Histogram-based federated XGBoost (gradient histograms shared each split) would, at the cost of a lot more communication.
