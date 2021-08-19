#!/bin/bash

# Recovery script that implements the recommended recovery steps here:
# https://www.postgresql.org/docs/13/continuous-archiving.html#BACKUP-PITR-RECOVERY

# Turn on recovery conf
cp -f /wal-g/recovery.conf /opt/bitnami/postgresql/conf/conf.d/recovery.conf

# disable remote connections
mv /opt/bitnami/postgresql/conf/pg_hba.conf /opt/bitnami/postgresql/conf/pg_hba.conf.orig
cp -f /wal-g/pg_hba.conf /opt/bitnami/postgresql/conf/pg_hba.conf

# disable archive mode
if [ -f /opt/bitnami/postgresql/conf/conf.d/archive.conf ]
then 
    echo "moving away archive.conf before recover..."
    mv /opt/bitnami/postgresql/conf/conf.d/archive.conf /opt/bitnami/postgresql/conf/conf.d/archive.conf.orig
fi

# backup pg_wal
if [ ! -d /wal-g/pg_wal ] && [ -d $PGDATA/pg_wal ]
then
    echo "saving a copy of pg_wal before fetch base backup..."
    mv $PGDATA/pg_wal /wal-g/pg_wal
fi

# delete all content of $PGDATA
rm -rf $PGDATA/*

# fetch most recent full backup
if [ -z "$MAGDA_RECOVERY_BASE_BACKUP_NAME" ]
then 
    echo "fetch LATEST backup..."
    wal-g backup-fetch $PGDATA LATEST
else 
    echo "fetch backup: ${MAGDA_RECOVERY_BASE_BACKUP_NAME}..."
    wal-g backup-fetch $PGDATA "$MAGDA_RECOVERY_BASE_BACKUP_NAME"
fi


# Remove any files present in pg_wal/ that is restored from backup
# Restore with previous saved copy
rm -rf $PGDATA/pg_wal
if [ -d /wal-g/pg_wal ]
then 
    echo "restoring a saved copy of pg_wal after fetch base backup..."
    cp -rf /wal-g/pg_wal $PGDATA/pg_wal
fi

# after this line, postgresql will start and enter recovery mode