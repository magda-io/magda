#!/bin/sh
cd /flyway
tar xzf flyway-commandline-4.2.0-linux-x64.tar.gz
cd flyway-4.2.0
PGUSER="${PGUSER:-postgres}" pg_ctl -D "$PGDATA" -o "-c listen_addresses='localhost'" -w start

for d in /flyway/sql/*; do
    if [ -d "$d" ]; then
        echo Migrating database $(basename "$d")
        ./flyway migrate -baselineOnMigrate=true -url=jdbc:postgresql://localhost/$(basename "$d") -locations=filesystem:$d -user=${PGUSER:-postgres} -n
    fi
done

pg_ctl -D "$PGDATA" -m fast -w stop
exec "$@"
