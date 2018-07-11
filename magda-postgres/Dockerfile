FROM postgres:9.6

# Install wall-e
RUN apt-get update && \
    apt-get install -y patch && \
    apt-get install -y python3-pip lzop pv && \
    python3 -m pip install --upgrade pip && \
    python3 -m pip install wal-e[aws,google,swift]

COPY component/start.sh /usr/local/bin/

# docker-entrypoint.sh (from the parent image) frustratingly only creates the database
# if the "next" command it runs is "postgres".  But we want to do a migration after
# the normal startup, so we can't simply launch postgres.  So here we monkey patch
# the startup script to allow chaining to any command.  This is arguably better than
# the alternative of forking the upstream docker-entrypoint.sh entirely.
COPY component/docker-entrypoint.sh.patch /usr/local/bin
RUN patch -i /usr/local/bin/docker-entrypoint.sh.patch /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["start.sh", "postgres"]
