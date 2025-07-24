FROM ghcr.io/magda-io/openjdk:8-jre-buster

RUN sed -i 's|http://deb.debian.org/debian|http://archive.debian.org/debian|g' /etc/apt/sources.list && \
    sed -i 's|http://security.debian.org|http://archive.debian.org/debian-security|g' /etc/apt/sources.list && \
    echo 'Acquire::Check-Valid-Until "false";' > /etc/apt/apt.conf.d/99no-check-valid-until && \
    apt-get update && apt-get install -y postgresql-client && \
    rm -r /var/lib/apt/lists /var/cache/apt/archives

RUN mkdir -p /flyway/sql
# jre will be removed in migrate.sh in order to use the jre matches current arch
COPY component/flyway-commandline-4.2.0-linux-x64.tar.gz /flyway
COPY component/migrate.sh /usr/local/bin/

CMD ["migrate.sh"]
