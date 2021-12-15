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

function join_by { local IFS="$1"; shift; echo "$*"; }
JOINED_MEMORY_COMMAND_LINE_ARGS=$(join_by " " "${MEMORY_COMMAND_LINE_ARGS[@]}")
JOINED_BACKUP_COMMAND_LINE_ARGS=$(join_by " " "${BACKUP_COMMAND_LINE_ARGS[@]}")

PGARGS="-c listen_addresses='*' -c max_prepared_transactions=0 $DEBUGARG $JOINED_MEMORY_COMMAND_LINE_ARGS $JOINED_BACKUP_COMMAND_LINE_ARGS"

# Why this elaborate way of running the command? It lets us use the same string of PGARGS for running pg_ctl (above) as it does for postgres (below).
# Without it we get all these issues with exec expecting an array of strings vs pg_ctl -o expecting one big string.
COMMAND="$* $PGARGS"
echo "Running command $COMMAND"
exec echo "$COMMAND" | bash