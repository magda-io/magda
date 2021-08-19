#!/bin/bash

# set the mark so we won't enter recovery mode on pod restart even when "$MAGDA_RECOVERY_MODE" = "true"
touch /wal-g/recovery.complete

# clean up saved file during recovery
rm -rf /wal-g/pg_wal

# disable recovery mode
rm -f /opt/bitnami/postgresql/conf/conf.d/recovery.conf

# re-enable remote connections
rm -f /opt/bitnami/postgresql/conf/pg_hba.conf
mv /opt/bitnami/postgresql/conf/pg_hba.conf.orig /opt/bitnami/postgresql/conf/pg_hba.conf

# re-enable archive mode if it's on
if [ -f /opt/bitnami/postgresql/conf/conf.d/archive.conf.orig ]
then 
    mv /opt/bitnami/postgresql/conf/conf.d/archive.conf.orig /opt/bitnami/postgresql/conf/conf.d/archive.conf
fi

echo "Recovery completed! postgresql config will be reload to turn off recovery mode..."

echo "To re-enter the recovery mode, please recreate the pod."

bash -c "sleep 3 && /opt/bitnami/postgresql/bin/reload stop -D $PGDATA" &
