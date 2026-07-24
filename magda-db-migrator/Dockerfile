FROM eclipse-temurin:17-jre-jammy

ARG FLYWAY_VERSION=12.11.0
ENV FLYWAY_VERSION=${FLYWAY_VERSION}
# SHA256 of the platform-independent (no bundled JRE) flyway-commandline-${FLYWAY_VERSION}.tar.gz
# from the official Flyway GitHub release. Must be updated whenever FLYWAY_VERSION changes.
ARG FLYWAY_SHA256=d88552bb3aedc2ab2faa98fb2a50906e50fb8fb1c22b71cc3acd6d91c2f40a55

RUN apt-get update && \
    apt-get install -y --no-install-recommends postgresql-client curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Use the platform-independent Flyway distribution (no bundled JRE) so the image stays
# multi-arch and small; Flyway runs on the base image's JRE 17. Flyway 12 requires Java 17+.
#
# The distribution bundles JDBC drivers and plugins for ~30 databases (~290MB, almost
# all of it non-PostgreSQL). Keep only the PostgreSQL driver and its plugin. The driver
# and its `flyway-database-*` plugin must be removed together: Flyway eagerly loads every
# plugin via ServiceLoader, and a plugin whose driver is missing fails startup with a
# NoClassDefFoundError. This roughly halves the image. Re-check this keep-list when
# bumping FLYWAY_VERSION (plugin file names can change).
RUN mkdir -p /flyway/sql && \
    curl -fL "https://github.com/flyway/flyway/releases/download/flyway-${FLYWAY_VERSION}/flyway-commandline-${FLYWAY_VERSION}.tar.gz" -o /tmp/flyway.tgz && \
    echo "${FLYWAY_SHA256}  /tmp/flyway.tgz" | sha256sum -c - && \
    tar xzf /tmp/flyway.tgz -C /flyway && \
    rm -f /tmp/flyway.tgz && \
    cd "/flyway/flyway-${FLYWAY_VERSION}" && \
    find drivers -mindepth 1 -maxdepth 1 ! -name 'postgresql-*.jar' -exec rm -rf {} + && \
    find lib/flyway -maxdepth 1 -type f \
        \( -name 'flyway-database-*.jar' -o -name 'flyway-mysql-*.jar' \
           -o -name 'flyway-firebird-*.jar' -o -name 'flyway-gcp-*.jar' \) \
        ! -name 'flyway-database-postgresql-*.jar' -delete

COPY component/migrate.sh /usr/local/bin/

CMD ["migrate.sh"]
