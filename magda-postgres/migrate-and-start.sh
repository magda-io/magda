#!/bin/sh
cd /flyway
tar xzf flyway-commandline-4.2.0-linux-x64.tar.gz
cd flyway-4.2.0
PGUSER="${PGUSER:-postgres}" pg_ctl -D "$PGDATA" -o "-c listen_addresses='localhost'" -w start

for d in /flyway/sql/*; do
    if [ -d "$d" ]; then
        echo "Creating database $(basename "$d") (this will fail if it already exists; that's ok)"
        psql -U "${PGUSER:-postgres}" -c "CREATE DATABASE $(basename "$d") WITH OWNER = postgres ENCODING = 'UTF8' LC_COLLATE = 'en_US.utf8' LC_CTYPE = 'en_US.utf8' TABLESPACE = pg_default CONNECTION LIMIT = -1;"
        echo "Migrating database $(basename "$d")"
        ./flyway migrate -baselineOnMigrate=true -url=jdbc:postgresql://localhost/$(basename "$d") -locations=filesystem:$d -user=${PGUSER:-postgres} -n
    fi
done

pg_ctl -D "$PGDATA" -m fast -w stop

local BACKUP_COMMAND_LINE_ARGS=""
local MEMORY_COMMAND_LINE_ARGS=""

#https://wiki.postgresql.org/wiki/Tuning_Your_PostgreSQL_Server
if [ -z "${MEMORY_LIMIT}" ]; then
    local SHARED_BUFFERS=$(expr $MEMORY_LIMIT / 4)
    local EFFECTIVE_CACHE_SIZE=$(expr $MEMORY_LIMIT / 2)
    MEMORY_COMMAND_LINE_ARGS="\
        -c shared_buffers=${SHARED_BUFFERS}KB \
        -c effective_cache_size=${EFFECTIVE_CACHE_SIZE}KB"
fi

if [ -z "${BACKUP}" ]; then
    #https://github.com/wal-e/wal-e/issues/200
    local FIRST_RUN=true
    periodically_backup () {
        while true; do
            sleep 45

            local CURRENT_TIME=$(date +"%H:%M")
            if [[ "$CURRENT_TIME" == "$BACKUP_EXECUTION_TIME" ]] || [$FIRST_RUN = true]; then
                wal-e backup-push "$DATA_DIRECTORY"
                wal-e delete --confirm retain 30
                FIRST_RUN=false
            fi
        done
    }

    periodically_backup &

fi

if [[ "${BACKUP}" == "WAL" ]]; then
    BACKUP_COMMAND_LINE_ARGS="-c wal_level = replica \
        -c archive_mode = on \
        -c archive_command = 'wal-e wal-push %p' \
        -c archive_timeout = 60 \
        -c restore_command 'wal-e wal-fetch %f %p'"
fi


exec "$@ \
    $MEMORY_COMMAND_LINE_ARGS \
    $BACKUP_COMMAND_LINE_ARGS"