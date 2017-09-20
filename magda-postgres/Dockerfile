FROM postgres:9.6

RUN apt-get update && apt-get install -y patch
RUN mkdir -p /flyway/sql
RUN chown -R postgres /flyway
COPY component/flyway-commandline-4.2.0-linux-x64.tar.gz /flyway
COPY component/migrate-and-start.sh /usr/local/bin/

# Install wall-e
RUN sudo apt-get install python-pip && \
    sudo pip install wal-e aws azure google swift

# docker-entrypoint.sh (from the parent image) frustratingly only creates the database
# if the "next" command it runs is "postgres".  But we want to do a migration after
# the normal startup, so we can't simply launch postgres.  So here we monkey patch
# the startup script to allow chaining to any command.  This is arguably better than
# the alternative of forking the upstream docker-entrypoint.sh entirely.
COPY component/docker-entrypoint.sh.patch /usr/local/bin
RUN patch -i /usr/local/bin/docker-entrypoint.sh.patch /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["migrate-and-start.sh", "postgres"]
