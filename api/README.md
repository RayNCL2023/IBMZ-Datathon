# API: sepsis early warning on LinuxONE

FastAPI service that runs on the LinuxONE VM (s390x). It scores patients with Snap ML on the NNPA AI accelerator.

## Endpoints

Every endpoint except `/health` needs the header `x-api-key`.

| Method | Path | What |
|---|---|---|
| GET | `/health` | arch, byteorder, backend (`snapml` or `stub-news2`), `tree_format` (`zdnn_tensors` = AI accelerator), model version |
| POST | `/predict` | `{rows: [{HR, O2Sat, ...}]}` or `{history: [[row, ...], ...]}` → `{probabilities, alert, threshold, drivers, latency_ms}` |
| POST | `/news2` | `{rows}` → `{scores, alert, components}` |
| GET | `/metrics` | held-out evaluation vs NEWS2 per hospital |
| GET | `/ward?hour=N` | demo ward of real PhysioNet patients at hour N, with `risk`, `alert`, `news2`, `news2Alert`, `label` per bed |

Until `model/model.json` exists, `/predict` and `/ward` use a **NEWS2-based stub**, so the frontend can build against real response shapes.

## Model: five risk heads

Training lives in `ml/` and imports `app/features.py`, so train and serve share the same feature code. Each head is a separate XGBoost model that Snap ML runs on NNPA. They share one feature pass per bed.

| Head | Label (new events only, first episode) | Horizon | Trained on |
|---|---|---|---|
| sepsis | PhysioNet 2019 SepsisLabel | 6h | 2019 A+B |
| hypotension | MAP < 65 for 2 consecutive measured hours | 6h | 2019 A+B, 2012 |
| aki | KDIGO creatinine: +0.3 mg/dL in 48h, or 1.5x the lowest earlier value | 24h | 2019 A+B, 2012 |
| resp | SpO2 < 90 for 2h, or FiO2 up by 0.2 or more within 12h | 6h | 2019 A+B |
| mortality | in-hospital death | stay | 2012 (first 48h) |

Each head's threshold is set so it raises **the same number of alarms as NEWS2 ≥ 5** on validation, which makes every comparison apples-to-apples. `priority` = max over heads of risk ÷ threshold, which is how the ward is ranked.

```bash
cd ml && uv venv -p 3.12 .venv && uv pip install -p .venv -r requirements.txt
.venv/bin/python p2012/convert.py ~/Downloads/physionet-2012/raw ~/Downloads/physionet-2012/training_set2012
.venv/bin/python prepare.py            # ~3s: all sources -> cache/data.npz (features + every label)
.venv/bin/python train.py --export     # ~70s: trains all heads, compares with NEWS2, writes api/model/
.venv/bin/python train.py --targets sepsis --sites A   # one hospital only, for the federated comparison
```

`--export` writes `heads/<risk>.json`, `features.json`, `impute.json` (Snap ML ignores NaN branches, so we impute at train and serve time), `metrics.json` (thresholds plus held-out results), `test_patients.json` (the demo ward replays only these), and `parity.npz`. Keep **xgboost 2.1.4**, because Snap ML 1.17 can't read 3.x JSON. Never use pickle.

## Deploy (from the repo root on your laptop)

```bash
rsync -az --delete --exclude model/ --exclude .env api/ l1:~/mfc/api/ && rsync -az api/model/ l1:~/mfc/api/model/
ssh l1 'cd ~/mfc/api && sudo docker compose up -d --build'
curl -s http://148.100.78.203:8000/health
```

`API_KEY` lives in `~/mfc/api/.env` on the VM. Don't commit it.
