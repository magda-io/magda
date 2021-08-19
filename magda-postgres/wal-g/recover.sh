#!/bin/bash

# Recovery script that implements the recommended recovery steps here:
# https://www.postgresql.org/docs/13/continuous-archiving.html#BACKUP-PITR-RECOVERY

# Turn on recovery conf
cp /wal-g/recovery.conf /opt/bitnami/postgresql/conf/conf.d/recovery.conf

# disable remote connections
mv /opt/bitnami/postgresql/conf/pg_hba.conf /opt/bitnami/postgresql/conf/pg_hba.conf.orig
cp /wal-g/pg_hba.conf /opt/bitnami/postgresql/conf/pg_hba.conf

# disable archive mode
if [ -f /opt/bitnami/postgresql/conf/conf.d/archive.conf ]
then 
    mv /opt/bitnami/postgresql/conf/conf.d/archive.conf /opt/bitnami/postgresql/conf/conf.d/archive.conf.orig
fi

# backup pg_wal
if [ ! -f /wal-g/pg_wal ]
then 
    mv $PGDATA/pg_wal /wal-g/pg_wal
fi

# delete all content of $PGDATA
rm -rf $PGDATA/*

# fetch most recent full backup
wal-g backup-fetch $PGDATA LATEST

# Remove any files present in pg_wal/ that is restored from backup
# Restore with previous saved copy
rm -rf $PGDATA/pg_wal
cp -r /wal-g/pg_wal $PGDATA/pg_wal

# after this line, postgresql will start and enter recovery mode