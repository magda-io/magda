FROM bitnami/postgresql:13.3.0-debian-10-r79

# copy wal-g from pre-built image
COPY --from=ghcr.io/magda-io/magda-wal-g:1.1.0 /usr/local/bin/wal-g /usr/local/bin/wal-g

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
    chmod g=u /etc/passwd && \
    # create alternative wal-g prefetch path for postgresql 13
    mkdir -p /wal-g/prefetch && \
    chgrp -R 0 /wal-g/prefetch && \
    chmod -R g=u /wal-g/prefetch

ENV WALG_PREFETCH_DIR="/wal-g/prefetch"

USER 1001

CMD [ "/usr/local/bin/start.sh", "/opt/bitnami/scripts/postgresql/run.sh" ]