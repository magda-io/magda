### Upgrading Google Cloud SQL Using Google DMS

Magda v1 or later versions require postgreSQL 13. This document lists the steps of upgrading Google Cloud SQL instance to PostgreSQL 13 using [Google DMS](https://cloud.google.com/database-migration).

> Please note: Google DMS won't be able to handle everything --- see [FAQ](https://cloud.google.com/database-migration/docs/postgres/faq)

- Stop all connectors / minions
- Prepare source Cloud SQL instance:
  - Set `cloudsql.logical_decoding` and `cloudsql.enable_pglogical` flags to `on` and restart. You can set the flag via Google cloud Console.
  - Run [SQL statement](https://cloud.google.com/database-migration/docs/postgres/debugging-tools) to check if any tables has no primary key.
  - run `ALTER TABLE webhookevents ADD PRIMARY KEY (eventtypeid, webhookid);` to add primary key
  - Add extension: `CREATE EXTENSION IF NOT EXISTS pglogical;` (this statement needs to be run on every databases)
  - Add replication role `ALTER USER postgres with REPLICATION;`
  - Create DMS job (with same default postgres user password for new DB) and Start the DMS migration. Once the migration enter CDC stage then:
  - Set registry api full to 0 to stop write operation to existing db (registry-read will still serve all read requests to ensure no downtime)
  - connect to new db instance:
    - you can connect to the db by:
      - `gcloud config set project [project id]`
      - `gcloud sql connect [instance name] --user=postgres --quiet`
    - check if data is alright
    - create db user `client` (with same password as your source DB, you can find client user db password from k8s secrets) and assign privileges in **all Magda DBs** by:
      - create user `create user client with encrypted password '[password]';`

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO client;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO client;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO client;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO client;
```

After grant permission to `client` user, you can login db as `client` user to verify you can see all tables.

- Wait till replication delay reach zero, then:

  - Promote the migration
  - make sure events table SEQUENCE value is correct in postgres DB (DMS won't migrate this):
    - `SELECT last_value FROM events_eventid_seq;`
    - Compare with `SELECT eventid from events order by eventid DESC limit 1;`
    - If not match, set current val `SELECT setval('events_eventid_seq', xxxx);`

- Then:
  - Upgrade Magda to the latest verison e.g. v1.1.0
  - Verify eveything working alright
  - Delete DMS migration job
  - Delete replication master (auto-created by migration job)
  - Delete old database
