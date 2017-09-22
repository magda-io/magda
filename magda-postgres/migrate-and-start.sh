#!/bin/bash
BACKUP_COMMAND_LINE_ARGS=()
MEMORY_COMMAND_LINE_ARGS=()

#https://wiki.postgresql.org/wiki/Tuning_Your_PostgreSQL_Server
if [[ ! -z $MEMORY_LIMIT ]]; then
    SHARED_BUFFERS=$(expr $MEMORY_LIMIT / 4)
    EFFECTIVE_CACHE_SIZE=$(expr $MEMORY_LIMIT / 2)
    MEMORY_COMMAND_LINE_ARGS=(
        "-c" "shared_buffers=${SHARED_BUFFERS}KB" \
        "-c" "effective_cache_size=${EFFECTIVE_CACHE_SIZE}KB" )
fi

if [[ "${BACKUP}" == "WAL" ]]; then
    #TODO: This needs to have no apostrophes for the postgres thing and still have apostrophes for the pgctl thing
    BACKUP_COMMAND_LINE_ARGS=(\
        "-c" "wal_level=replica" \
        "-c" "archive_mode=on" \
        "-c" "archive_command='/usr/local/bin/wal-e wal-push $PGDATA/%p'" \
        "-c" "archive_timeout=60")

    echo "restore_command = '/usr/local/bin/wal-e wal-fetch %f %p'" > ${PGDATA}/recovery.conf
fi

function join_by { local IFS="$1"; shift; echo "$*"; }
JOINED_MEMORY_COMMAND_LINE_ARGS=$(join_by " " "${MEMORY_COMMAND_LINE_ARGS[@]}")
JOINED_BACKUP_COMMAND_LINE_ARGS=$(join_by " " "${BACKUP_COMMAND_LINE_ARGS[@]}")

cd /flyway
tar xzf flyway-commandline-4.2.0-linux-x64.tar.gz
cd flyway-4.2.0
PGARGS="-c listen_addresses='*' -c max_prepared_transactions=0 $JOINED_MEMORY_COMMAND_LINE_ARGS $JOINED_BACKUP_COMMAND_LINE_ARGS"
PGUSER="${PGUSER:-postgres}" pg_ctl -D "$PGDATA" -o "$PGARGS" -w start

for d in /flyway/sql/*; do
    if [[ -d "$d" ]]; then
        echo "Creating database $(basename "$d") (this will fail if it already exists; that's ok)"
        psql -U "${PGUSER:-postgres}" -c "CREATE DATABASE $(basename "$d") WITH OWNER = postgres ENCODING = 'UTF8' LC_COLLATE = 'en_US.utf8' LC_CTYPE = 'en_US.utf8' TABLESPACE = pg_default CONNECTION LIMIT = -1;"
        echo "Migrating database $(basename "$d")"
        ./flyway migrate -baselineOnMigrate=true -url=jdbc:postgresql://localhost/$(basename "$d") -locations=filesystem:$d -user=${PGUSER:-postgres} -n
    fi
done

pg_ctl -D "$PGDATA" -m fast -w stop

if [[ ! -z "${BACKUP}" ]]; then
    #https://github.com/wal-e/wal-e/issues/200
    FIRST_RUN=true
    periodically_backup () {
        while true; do
            sleep 45

            local CURRENT_TIME=$(date +"%H:%M")
            if [ "$CURRENT_TIME" == "$BACKUP_EXECUTION_TIME" ] || [ $FIRST_RUN == true ]; then
                /usr/local/bin/wal-e backup-push "$PGDATA"
                /usr/local/bin/wal-e delete --confirm retain 30
                FIRST_RUN=false
            fi
        done
    }

    periodically_backup &
fi

# Why this elaborate way of running the command? It lets us use the same string of PGARGS for running pg_ctl (above) as it does for postgres (below).
# Without it we get all these issues with exec expecting an array of strings vs pg_ctl -o expecting one big string.
COMMAND="$* $PGARGS"
echo "Running command $COMMAND"
exec echo "$COMMAND" | bash