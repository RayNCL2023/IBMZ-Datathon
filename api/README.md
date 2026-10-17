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

## NNPA vs CPU benchmark (`bench.py`, served at `GET /benchmark`)

Sepsis head on the 3-core LinuxONE VM. All backends match the XGBoost export within 5e-7.

| Backend | 1 row | 12 rows (ward) | 10k rows | Throughput at 10k |
|---|---|---|---|---|
| Snap ML, NNPA (`zdnn_tensors`) | 0.089 ms | 0.143 ms | 30.7 ms | 0.33M rows/s |
| Snap ML, CPU (`compress_trees`) | 0.013 ms | 0.043 ms | 5.8 ms | 1.73M rows/s |
| XGBoost 2.0.3, CPU | 0.212 ms | 0.208 ms | 12.1 ms | 0.82M rows/s |

For these heads (100-575 depth-6 trees) the NNPA path is slower than Snap ML's CPU path. It doesn't offload the CPU either: 85 ms of CPU per 10k rows vs 19 ms. Set `TREE_FORMAT=compress_trees` in `.env` to serve on the CPU.

## Granite SBAR handover (`POST /handover/{patientId}`)

The rules in `app/handover.py` build the SBAR from the data, so it is always correct. Granite 4.0 then writes a short spoken-style summary on the VM (no data leaves it). The `granite` container is built from IBM's LinuxONE image, whose llama.cpp is compiled with zDNN (NNPA) and OpenBLAS. It has no published port, so only the API can reach it.

Each summary is checked in two ways:
- Every number must appear in the facts.
- A sentence that names a condition must say "risk", so a predicted risk is never written as a diagnosis.

If either check fails, the summary comes back with `verified: false`, and the UI should fall back to the rule-based SBAR.

One-off model setup on the VM. IBM's image only ships the *base* 350M model, so we use the instruct one, byte-swapped for s390x:
```bash
mkdir -p ~/granite && cd ~/granite
curl -LO https://huggingface.co/ibm-granite/granite-4.0-h-350m-GGUF/resolve/main/granite-4.0-h-350m-bf16.gguf
mv granite-4.0-h-350m-bf16.gguf granite-4.0-h-350m-bf16-be.gguf
echo YES | sudo docker run --rm -i -v ~/granite:/m --entrypoint sh registry.linuxone.cloud.marist.edu/l1cc/jupyterlab-image-s390x:latest \
  -c "pip install -q --target /tmp/g gguf && cd /tmp && PYTHONPATH=/tmp/g /opt/venv/bin/python /tmp/g/gguf/scripts/gguf_convert_endian.py /m/granite-4.0-h-350m-bf16-be.gguf big"
```

Same 5 patients, 3 shared cores:

| Model | Time per note | Notes |
|---|---|---|
| 350M bf16 (default) | ~15 s | Faithful most of the time. Sometimes mixes up which number belongs to what; the checks catch some of this, not all |
| 1B Q8_0 | 20–75 s | Worse: misattributed risks, truncated output |
| 3B micro Q4_K_M | 100–140 s | Best wording. Set `GRANITE_FILE=granite-4.0-h-micro-Q4_K_M-be.gguf` in `.env` to use it |
