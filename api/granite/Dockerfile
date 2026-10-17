# IBM's LinuxONE image ships llama-cpp-python built with zDNN (NNPA) + OpenBLAS for s390x.
FROM registry.linuxone.cloud.marist.edu/l1cc/jupyterlab-image-s390x:latest
USER root
COPY server.py /srv/granite/server.py
WORKDIR /srv/granite
ENTRYPOINT ["/opt/venv/bin/python", "server.py"]
