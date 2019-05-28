#!/bin/bash
BACKUP_COMMAND_LINE_ARGS=()
MEMORY_COMMAND_LINE_ARGS=()

#https://wiki.postgresql.org/wiki/Tuning_Your_PostgreSQL_Server
if [[ ! -z $MEMORY_LIMIT ]]; then
    MEMORY_IN_BYTES=$(echo $MEMORY_LIMIT | awk '{
        ex = index("kmgtpezy", substr($1, length($1)))
        val = substr($1, 0, length($1) - 1)

        prod = val * 10^(ex * 3)

        sum += prod
    }
    END {print sum}')

    SHARED_BUFFERS=$(expr $MEMORY_IN_BYTES / 4 / 100)
    EFFECTIVE_CACHE_SIZE=$(expr $MEMORY_IN_BYTES / 2 / 100)
    MEMORY_COMMAND_LINE_ARGS=( \
        "-c" "shared_buffers=${SHARED_BUFFERS}kB" \
        "-c" "effective_cache_size=${EFFECTIVE_CACHE_SIZE}kB" )
fi

if [[ "${BACKUP}" == "WAL" ]]; then
    if [ ! -f "$PGDATA/recovery.done" ]; then
        wal-e backup-fetch $PGDATA LATEST
    elif [ -f "$PGDATA/backup_label" ]; then
        echo "Moving backup_label as we don't need to recover and it might interrupt startup"
        mv "$PGDATA/backup_label" "$PGDATA/backup_label_$(date +%d-%m-%Y).dat"
    fi

    if [[ "${BACKUP_RO}" != "TRUE" ]]; then
        BACKUP_COMMAND_LINE_ARGS=(\
            "-c" "wal_level=replica" \
            "-c" "archive_mode=on" \
            "-c" "archive_command='/usr/local/bin/wal-e wal-push $PGDATA/%p'" \
            "-c" "archive_timeout=60")

        #https://github.com/wal-e/wal-e/issues/200
        FIRST_RUN=true
        periodically_backup () {
            while true; do
                sleep 45

                local CURRENT_TIME=$(date +"%H:%M")
                if [ "$CURRENT_TIME" == "$BACKUP_EXECUTION_TIME" ] || [ $FIRST_RUN == true ]; then
                    /usr/local/bin/wal-e backup-push --pool-size 1 --cluster-read-rate-limit 10000000 "$PGDATA"
                    /usr/local/bin/wal-e delete --confirm retain 30
                    FIRST_RUN=false
                fi
            done
        }

        periodically_backup &
    fi

    if [ ! -f "$PGDATA/recovery.done" ]; then
        echo "restore_command = '/usr/local/bin/wal-e wal-fetch %f %p'" > ${PGDATA}/recovery.conf

        if [[ ! -z "${BACKUP_RECOVERY_MODE}" ]]; then
            echo "recovery_target = 'immediate'" >> ${PGDATA}/recovery.conf
        fi
    fi
fi

function join_by { local IFS="$1"; shift; echo "$*"; }
JOINED_MEMORY_COMMAND_LINE_ARGS=$(join_by " " "${MEMORY_COMMAND_LINE_ARGS[@]}")
JOINED_BACKUP_COMMAND_LINE_ARGS=$(join_by " " "${BACKUP_COMMAND_LINE_ARGS[@]}")

if [[ "${DEBUG}" == "1" ]]; then
    DEBUGARG='-c shared_preload_libraries='"'"'/usr/lib/postgresql/9.6/lib/plugin_debugger'"'"''
else 
    DEBUGARG=''
fi

PGARGS="-c listen_addresses='*' -c max_prepared_transactions=0 $DEBUGARG $JOINED_MEMORY_COMMAND_LINE_ARGS $JOINED_BACKUP_COMMAND_LINE_ARGS"

# Why this elaborate way of running the command? It lets us use the same string of PGARGS for running pg_ctl (above) as it does for postgres (below).
# Without it we get all these issues with exec expecting an array of strings vs pg_ctl -o expecting one big string.
COMMAND="$* $PGARGS"
echo "Running command $COMMAND"
exec echo "$COMMAND" | bash