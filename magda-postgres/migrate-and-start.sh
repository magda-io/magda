#!/bin/sh
cd /flyway
tar xzf flyway-commandline-4.2.0-linux-x64.tar.gz
cd flyway-4.2.0
PGUSER="${PGUSER:-postgres}" pg_ctl -D "$PGDATA" -o "-c listen_addresses='localhost'" -w start

for d in /flyway/sql/*; do
    if [ -d "$d" ]; then
        echo "Creating database $(basename "$d") (this will fail if it already exists; that's ok)"
        # Create the database if it does not exist.
        psql -U "${PGUSER:-postgres}" -c "CREATE DATABASE $(basename "$d") WITH OWNER = postgres ENCODING = 'UTF8' LC_COLLATE = 'en_US.utf8' LC_CTYPE = 'en_US.utf8' TABLESPACE = pg_default CONNECTION LIMIT = -1;"
        echo "Migrating database $(basename "$d")"
        # Run migrations
        ./flyway migrate -baselineOnMigrate=true -url=jdbc:postgresql://localhost/$(basename "$d") -locations=filesystem:$d -user=${PGUSER:-postgres} -n
    fi
done

pg_ctl -D "$PGDATA" -m fast -w stop
exec "$@"
