# API: sepsis early warning on LinuxONE

FastAPI service that runs on the LinuxONE VM (s390x). It scores patients with Snap ML on the NNPA AI accelerator.

## Endpoints

Every endpoint except `/health` needs the header `x-api-key`.

| Method | Path | What |
|---|---|---|
| GET | `/health` | arch, byteorder, backend (`snapml` or `stub-news2`), `tree_format` (`zdnn_tensors` = AI accelerator), model version |
| POST | `/predict` | `{rows: [{HR, O2Sat, ...}]}` → `{probabilities, alert, threshold, drivers, latency_ms}` |
| POST | `/news2` | `{rows}` → `{scores, alert, components}` |
| GET | `/ward?hour=N` | demo ward of real PhysioNet patients at hour N, with `risk`, `alert`, `news2`, `news2Alert`, `label` per bed |

Until `model/model.json` exists, `/predict` and `/ward` use a **NEWS2-based stub**, so the frontend can build against real response shapes.

## Model hand-off (ML lead)

Drop these three files into `api/model/`, then redeploy:
- `model.json`: `booster.save_model("model.json")`. **Never use pickle.**
- `features.json`: the ordered list of feature names
- `impute.json`: `{feature: value}`. Snap ML ignores XGBoost's missing-value branches, so impute the same way when training.

## Deploy (from the repo root on your laptop)

```bash
rsync -az --delete --exclude model/ api/ l1:~/mfc/api/ && rsync -az api/model/ l1:~/mfc/api/model/
ssh l1 'cd ~/mfc/api && sudo docker compose up -d --build'
curl -s http://148.100.78.203:8000/health
```

`API_KEY` lives in `~/mfc/api/.env` on the VM. Don't commit it.
