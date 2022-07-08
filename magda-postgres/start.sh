#!/bin/bash

# shellcheck disable=SC1091

set -o errexit
set -o nounset
set -o pipefail
#set -o xtrace

# Load libraries
. /opt/bitnami/scripts/liblog.sh
. /opt/bitnami/scripts/libvalidations.sh

# Load PostgreSQL environment variables
. /opt/bitnami/scripts/postgresql-env.sh

# is_boolean_yes function can recognise both case insensitive 'yes' or 'true'
if is_boolean_yes "$MAGDA_BACKUP_MODE"
then
    info "Backup mode is turned on." 
    info "Making sure replication config in ${POSTGRESQL_PGHBA_FILE} is available for creating base backup remotely..."
    if FOUND_REPLICATION_ENTRY=$(cat ${POSTGRESQL_PGHBA_FILE} | grep replication)
    then
        info "Found the following 'replication' entry, skip adding 'replication' entry."
        echo $FOUND_REPLICATION_ENTRY
    else
        echo "# replication keyword allows base backup to be created remotely using wal-g" >> $POSTGRESQL_PGHBA_FILE
        echo "host     replication     all        0.0.0.0/0               md5" >> $POSTGRESQL_PGHBA_FILE
        info "Cannot locate any 'replication' entry, added 'replication' entry to ${POSTGRESQL_PGHBA_FILE}."
    fi
fi

# '/wal-g/recovery.complet' will only be kept until the pod is recreated
if is_boolean_yes "$MAGDA_RECOVERY_MODE" && [[ ! -f /wal-g/recovery.complete ]]
then
    info "Recovery mode is turned on. entering recovery mode..."
    /wal-g/recover.sh
fi

echo ""
exec "$@"