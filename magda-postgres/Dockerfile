FROM ghcr.io/magda-io/postgresql:17.5.0-debian-12-r20

# copy wal-g from pre-built image
COPY --from=ghcr.io/magda-io/magda-wal-g:3.0.8-magda-edcda8b /usr/local/bin/wal-g /usr/local/bin/wal-g

USER root
# Install [envdir](https://cr.yp.to/daemontools/envdir.html)
# Used to set up env vars based on files mounted from configMap or secret
RUN install_packages daemontools

COPY component/start.sh /usr/local/bin/
COPY component/adduser.sh /usr/local/bin/

COPY component/wal-g /wal-g

# follow openshfit guidelines for supporting arbitrary user IDs
# https://docs.openshift.com/container-platform/3.3/creating_images/guidelines.html#openshift-container-platform-specific-guidelines
RUN mkdir -p /etc/wal-g.d/env && \
    chgrp -R 0 /etc/wal-g.d/env && \
    chmod -R g=u /etc/wal-g.d/env && \
    chgrp -R 0 /wal-g && \
    chmod -R g=u /wal-g && \
    # Allow user to add use record (for user 1001) in /etc/passwd
    chmod g=u /etc/passwd

# wal-g's WAL prefetch during recovery moves segments into $PGDATA/pg_wal with
# rename(2), which fails across filesystems ("invalid cross-device link") on
# wal-g 3.x. Keep the prefetch dir on the SAME filesystem as PGDATA (the data
# PVC mounts at /bitnami/postgresql) but OUTSIDE PGDATA (/bitnami/postgresql/data)
# so it still avoids the postgresql-13 pg_rewind issue. wal-g creates it at runtime.
ENV WALG_PREFETCH_DIR="/bitnami/postgresql/wal-g-prefetch"

USER 1001

CMD [ "/usr/local/bin/start.sh", "/opt/bitnami/scripts/postgresql/run.sh" ]
