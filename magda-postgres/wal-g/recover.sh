#!/bin/bash

# Recovery script that implements the recommended recovery steps here:
# https://www.postgresql.org/docs/13/continuous-archiving.html#BACKUP-PITR-RECOVERY

# Load libraries
. /opt/bitnami/scripts/liblog.sh
. /opt/bitnami/scripts/libvalidations.sh

# Load PostgreSQL environment variables
. /opt/bitnami/scripts/postgresql-env.sh

# Turn on recovery conf
cp -f /wal-g/recovery.conf /opt/bitnami/postgresql/conf/conf.d/recovery.conf

# disable remote connections
mv -f /opt/bitnami/postgresql/conf/pg_hba.conf /opt/bitnami/postgresql/conf/pg_hba.conf.orig
cp -f /wal-g/pg_hba.conf /opt/bitnami/postgresql/conf/pg_hba.conf

# disable archive mode
if [ -f /opt/bitnami/postgresql/conf/conf.d/archive.conf ]
then 
    info "moving away archive.conf before recover..."
    mv -f /opt/bitnami/postgresql/conf/conf.d/archive.conf /opt/bitnami/postgresql/conf/conf.d/archive.conf.orig
fi

# backup pg_wal
if [ ! -d /wal-g/pg_wal ] && [ -d $PGDATA/pg_wal ]
then
    info "saving a copy of pg_wal before fetch base backup..."
    mv $PGDATA/pg_wal /wal-g/pg_wal
fi

# delete all content of $PGDATA
info "delete all content of $PGDATA before fetching base backup..."
rm -rf $PGDATA/*

# fetch most recent full backup
touch /wal-g/base-backup.fetching
if [ -z "$MAGDA_RECOVERY_BASE_BACKUP_NAME" ]
then 
    info "fetch LATEST backup..."
    /usr/bin/envdir /etc/wal-g.d/env /usr/local/bin/wal-g backup-fetch $PGDATA LATEST
else 
    info "fetch backup: ${MAGDA_RECOVERY_BASE_BACKUP_NAME}..."
    /usr/bin/envdir /etc/wal-g.d/env /usr/local/bin/wal-g backup-fetch $PGDATA "$MAGDA_RECOVERY_BASE_BACKUP_NAME"
fi

rm -f /wal-g/base-backup.fetching
BACKUP_FETCH_STATUS=$?

# check if previous base backup is fully completed
if [ "$BACKUP_FETCH_STATUS" = "0" ]
then
    # base backup restore completes
    # Remove any files present in pg_wal/ that is restored from backup
    # Restore with previous saved copy
    if [ -d /wal-g/pg_wal ]
    then 
        rm -rf $PGDATA/pg_wal
        info "restoring a saved copy of pg_wal after fetch base backup..."
        cp -rf /wal-g/pg_wal $PGDATA/pg_wal
    fi
    # enable recovery mode
    touch $PGDATA/recovery.signal
else
    # base backup fetch / restore failed
    # try to go ahead without entering recovery
    # Restore pg_wal with previous saved copy
    # Remove the saved copy at /wal-g/pg_wal
    error "Failed to fetch / restore base backup, will restart the pod..."
    rm -f touch $PGDATA/recovery.signal
    exit 1
fi
