#!/bin/bash

# shellcheck disable=SC1091

set -o errexit
set -o nounset
set -o pipefail
#set -o xtrace

# Load libraries
. /opt/bitnami/scripts/liblog.sh

# Load PostgreSQL environment variables
. /opt/bitnami/scripts/postgresql-env.sh

if [[ "${MAGDA_BACKUP_MODE:=false}" = "true" ]]
then
    info "Backup mode is turned on." 
    info "Making sure replication config in ${POSTGRESQL_PGHBA_FILE} is available for creating base backup remotely..."
    FOUND_REPLICATION_ENTRY=$(cat ${POSTGRESQL_PGHBA_FILE} | grep replication)
    if [[ "$?" = "0" ]]
    then
        info "Found the following 'replication' entry, skip adding 'replication' entry."
        echo $FOUND_REPLICATION_ENTRY
    else
        echo "# replication keyword allows base backup to be created remotely using wal-g" >> $POSTGRESQL_PGHBA_FILE
        echo "host     replication     all        0.0.0.0/0               md5" >> $POSTGRESQL_PGHBA_FILE
        info "Cannot locate any 'replication' entry, added 'replication' entry to ${POSTGRESQL_PGHBA_FILE}."
    fi
fi

if [[ "${MAGDA_RECOVERY_MODE:=false}" = "true" ]] && [[ ! -f /wal-g/recovery.complete ]]
then
    info "Recovery mode is turned on. Entering recovery mode..."
    /wal-g/recover.sh
fi

echo ""
exec "$@"