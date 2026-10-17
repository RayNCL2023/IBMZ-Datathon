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

## Model

Training lives in `ml/` and imports `app/features.py`, so train and serve use the same feature code.

```bash
cd ml && uv venv -p 3.12 .venv && uv pip install -p .venv -r requirements.txt
.venv/bin/python prepare.py            # ~3s: all 40k patients -> cache/data.npz (107 features)
.venv/bin/python train.py --export     # ~15s: trains, compares with NEWS2, writes api/model/
.venv/bin/python train.py --train-on A # site-only model, for the federated comparison
```

`--export` writes `model.json`, `features.json`, `impute.json` (Snap ML ignores NaN branches, so we impute at train and serve time), `metrics.json` (threshold plus held-out results), `test_patients.json` (the demo ward replays only these), and `parity.npz`. Keep **xgboost 2.1.4**, because Snap ML 1.17 can't read 3.x JSON. Never use pickle.

## Deploy (from the repo root on your laptop)

```bash
rsync -az --delete --exclude model/ --exclude .env api/ l1:~/mfc/api/ && rsync -az api/model/ l1:~/mfc/api/model/
ssh l1 'cd ~/mfc/api && sudo docker compose up -d --build'
curl -s http://148.100.78.203:8000/health
```

`API_KEY` lives in `~/mfc/api/.env` on the VM. Don't commit it.
