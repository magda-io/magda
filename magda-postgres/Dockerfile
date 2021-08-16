FROM bitnami/postgresql:13.3.0-debian-10-r79

# copy wal-g from pre-built image
COPY --from=bitnami/wal-g:1.1.0-debian-10-r3 /opt/bitnami/wal-g/bin/wal-g /usr/local/bin/wal-g
