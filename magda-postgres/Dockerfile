FROM bitnami/postgresql:13.3.0-debian-10-r79

# copy wal-g from pre-built image
COPY --from=bitnami/wal-g:1.1.0-debian-10-r3 /opt/bitnami/wal-g/bin/wal-g /usr/local/bin/wal-g

USER root
# Install [envdir](https://cr.yp.to/daemontools/envdir.html)
# Used to set up env vars based on files mounted from configMap or secret
RUN install_packages daemontools

COPY component/start.sh /usr/local/bin/

COPY --chown=1001 component/wal-g /wal-g

USER 1001

CMD [ "/usr/local/bin/start.sh", "/opt/bitnami/scripts/postgresql/run.sh" ]