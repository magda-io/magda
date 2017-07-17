#!/bin/sh
echo MIGRATING!!
cd /flyway
tar xzf flyway-commandline-4.2.0-linux-x64.tar.gz
cd flyway-4.2.0
pg_ctl -D "$PGDATA" -o "-c listen_addresses='localhost'" -w start
./flyway migrate --url jdbc:postgresql://localhost/postgres --locations filesystem:../sql
pg_ctl -D "$PGDATA" -m fast -w stop
exec "$@"
