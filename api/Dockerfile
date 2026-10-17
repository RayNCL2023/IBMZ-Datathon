FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1

# Scientific stack from apt: PyPI has no s390x wheels for numpy/scipy/sklearn.
# libzdnn0 (s390x only) lets Snap ML run on the NNPA AI accelerator; without it, it silently uses CPU.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-numpy python3-scipy python3-sklearn libpython3.12t64 libgomp1 \
      $(dpkg --print-architecture | grep -qx s390x && echo libzdnn0) \
 && rm -rf /var/lib/apt/lists/*

# snapml ships s390x wheels; --no-deps keeps pip from rebuilding numpy & co.
RUN pip install --break-system-packages --no-cache-dir --no-deps snapml \
 && pip install --break-system-packages --no-cache-dir fastapi uvicorn

WORKDIR /srv
COPY app ./app

ENV MODEL_DIR=/app/model DATA_DIR=/data
EXPOSE 8000
CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
