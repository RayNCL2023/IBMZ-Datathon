# One image for every hospital node and the coordinator. Build context: repo root.
#   docker build -f fed/Dockerfile -t mfc-fed .
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1

# Ubuntu ships XGBoost 2.0.3 for s390x, so hospitals train natively on LinuxONE (PyPI has no s390x wheel).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-numpy python3-scipy python3-sklearn python3-xgboost \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --break-system-packages --no-cache-dir fastapi uvicorn

WORKDIR /srv
COPY api/app/__init__.py api/app/features.py api/app/news2.py api/app/
COPY ml/labels.py ml/prepare.py ml/train.py ml/
COPY fed/dp.py fed/node.py fed/server.py fed/coordinator.py fed/

WORKDIR /srv/fed
CMD ["python3", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
