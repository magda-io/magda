FROM postgres:9.6

COPY component/start.sh /usr/local/bin/

# Install wall-e
RUN apt-get update && \
    apt-get install -y python3-pip lzop pv && \
    python3 -m pip install --upgrade pip && \
    python3 -m pip install wal-e[aws,azure,google,swift]

CMD ["start.sh", "postgres"]
