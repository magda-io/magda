FROM eclipse-temurin:17-jre-jammy

ARG FLYWAY_VERSION=12.11.0
ENV FLYWAY_VERSION=${FLYWAY_VERSION}
# SHA256 of the platform-independent (no bundled JRE) flyway-commandline-${FLYWAY_VERSION}.tar.gz
# from the official Flyway GitHub release. Must be updated whenever FLYWAY_VERSION changes.
ARG FLYWAY_SHA256=d88552bb3aedc2ab2faa98fb2a50906e50fb8fb1c22b71cc3acd6d91c2f40a55

# `ldconfig` is deliberately neutralised for the duration of this install.
#
# The image is built for linux/amd64 and linux/arm64 from a single runner, so one
# architecture is always emulated by qemu. glibc 2.35's `ldconfig` segfaults under
# qemu-user, and it runs as a dpkg trigger for `libc-bin`, so installing anything
# at all fails the build:
#
#   Processing triggers for libc-bin ...
#   Segmentation fault (core dumped)
#   dpkg: error processing package libc-bin (--configure): ... exit status 139
#
# (The previous base image was Debian buster / glibc 2.28, which predates the bug.)
#
# Nothing installed here needs the shared-library cache rebuilt at build time —
# these are client binaries, not libraries other packages link against — and the
# real `ldconfig` is restored immediately afterwards, so runtime behaviour on real
# hardware is unchanged. Revisit when the base image moves to a glibc/qemu
# combination without this bug.
# Only the real binary is swapped, never `/usr/sbin/ldconfig` itself: on Debian and
# Ubuntu that path is a trigger *wrapper* script which execs `/sbin/ldconfig.real`,
# and because the base image is usr-merged `/sbin/ldconfig.real` IS
# `/usr/sbin/ldconfig.real` — moving the wrapper onto that name overwrites the real
# binary and leaves the image with no working ldconfig at all.
#
# The trailing assertions verify the restore WITHOUT executing ldconfig. Running it
# here would segfault on the emulated architecture for exactly the reason this block
# exists, so the check inspects the file instead: it must be a real, executable ELF
# binary — not the `/bin/true` symlink left behind by a failed restore, and not the
# ~400-byte wrapper script (moving the wrapper onto this name destroys the real
# binary and leaves the image with no working ldconfig at all).
RUN set -eux; \
    mv /usr/sbin/ldconfig.real /usr/sbin/ldconfig.real.disabled; \
    ln -s /bin/true /usr/sbin/ldconfig.real; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-client curl ca-certificates; \
    rm -rf /var/lib/apt/lists/*; \
    rm /usr/sbin/ldconfig.real; \
    mv /usr/sbin/ldconfig.real.disabled /usr/sbin/ldconfig.real; \
    test ! -L /usr/sbin/ldconfig.real; \
    test -x /usr/sbin/ldconfig.real; \
    test "$(stat -c '%s' /usr/sbin/ldconfig.real)" -gt 100000

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
