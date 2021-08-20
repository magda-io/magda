FROM bitnami/postgresql:13.3.0-debian-10-r79

# copy wal-g from pre-built image
COPY --from=data61/magda-wal-g:1.1.0 /usr/local/bin/wal-g /usr/local/bin/wal-g

USER root
# Install [envdir](https://cr.yp.to/daemontools/envdir.html)
# Used to set up env vars based on files mounted from configMap or secret
RUN install_packages daemontools

COPY component/start.sh /usr/local/bin/

COPY --chown=1001 component/wal-g /wal-g

RUN mkdir -p /etc/wal-g.d/env && chown 1001 /etc/wal-g.d/env

USER 1001

CMD [ "/usr/local/bin/start.sh", "/opt/bitnami/scripts/postgresql/run.sh" ]