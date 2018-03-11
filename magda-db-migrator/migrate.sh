#!/bin/bash

cd /flyway
tar xzf flyway-commandline-4.2.0-linux-x64.tar.gz
cd flyway-4.2.0

for d in /flyway/sql/*; do
    if [[ -d "$d" ]]; then
        echo "Creating database $(basename "$d") (this will fail if it already exists; that's ok)"
        psql -h "${DB_HOST}" -c "CREATE DATABASE $(basename "$d") WITH OWNER = ${PGUSER:-postgres} CONNECTION LIMIT = -1;" postgres
        echo "Migrating database $(basename "$d")"
        ./flyway migrate -baselineOnMigrate=true -url=jdbc:postgresql://"${DB_HOST}"/$(basename "$d") -locations=filesystem:$d -user=${PGUSER:-postgres} -password=${PGPASSWORD} -placeholders.clientUserName="${CLIENT_USERNAME}" -placeholders.clientPassword="${CLIENT_PASSWORD}" -n
    fi
done
