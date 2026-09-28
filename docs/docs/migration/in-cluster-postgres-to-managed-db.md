# How to migrate the in-cluster database to a managed / cloud database

This is **Pathway B** of the
[PostgreSQL Upgrade & Migration Pathways](../postgres-upgrade-migration-pathways.md):
moving off Magda's bundled in-cluster PostgreSQL onto a managed / cloud database
(AWS RDS, Azure Database for PostgreSQL, or GCP Cloud SQL). Do this **while still
on Magda v6**, verify Magda runs against the managed database, then upgrade to v7 —
at which point PostgreSQL is operated by your provider and the in-cluster
`majorUpgrade` mechanism does not apply to you.

Use this pathway if v7 is the moment you want to stop running PostgreSQL yourself.
If you want to keep the database in-cluster, use
[Pathway A](../postgres-major-upgrade-runbook.md) instead. If you are already on a
managed database, you are on
[Pathway C](../postgres-upgrade-migration-pathways.md#pathway-c--already-on-a-managed--cloud-database).

## wal-g backups are not a migration path

The in-cluster [wal-g backup/restore mechanism](../in-cluster-database-backup-and-restore.md)
is **not** a way to load data into a managed database. `wal-g backup-fetch`
restores a **physical** copy of a PostgreSQL 13 data directory, which only a
PostgreSQL 13 server running the same on-disk layout can read — not a managed
service you do not control the file system of. This migration is a **logical**
`pg_dump` / `psql` load, which is portable across servers and versions.

## The shape of the migration

1. Provision the managed database and make it reachable from the cluster.
2. Stop application writes so the dump is a clean, consistent point.
3. Create the `client` login role, then `pg_dump` each database out of the
   running in-cluster server and load it into the managed database, and grant
   `client` its privileges.
4. Verify every database restored and `client` can read its data.
5. Cut over: `helm upgrade` to **v7** pointed at the managed database, and verify.
6. Decommission the in-cluster database.

Steps 2–5 are the downtime window. Plan for it: the dump reads the whole database
over the network and the load replays it, so the window scales with your data
size.

## Before you start

- **A managed PostgreSQL instance** running a version Magda supports (**13–17**),
  reachable from inside the cluster on port 5432. For AWS, the VPC peering /
  security-group / DNS setup is the same as a fresh external-DB install — see
  [Deploy Magda on AWS EKS](../deploy-to-aws.md), step 3. Azure Database for
  PostgreSQL and any other directly-addressable endpoint use the same Magda
  configuration path as RDS (below).
- **The managed instance's master username and password.** The master user does
  not need to be named `postgres`, but it must be able to create databases and
  roles. Note that managed services (AWS RDS, Azure, Cloud SQL) do **not** give
  you a real PostgreSQL superuser — your master account is privileged but not
  `SUPERUSER`. This is why this how-to uses per-database `pg_dump` with
  `--no-owner --no-privileges` plus an explicit `client` grant, rather than a
  single `pg_dumpall`: a `pg_dumpall` stream recreates the source's superuser
  roles and object ownership and issues `SET ROLE` to them, which a non-superuser
  master cannot do — the restore then fails partway and can **silently drop data**
  (most dangerously the registry tables in the shared `postgres` database), while
  still creating the empty databases so the failure is easy to miss.
- **The in-cluster superuser password.** In a default combined-db install it is in
  the secret named by `global.postgresql.existingSecret` (default
  `db-main-account-secret`), key `postgresql-password`, and the user is `postgres`
  (`global.postgresql.postgresqlUsername`).
- **A rough size estimate**, to gauge the downtime window:
  ```sql
  SELECT pg_size_pretty(sum(pg_database_size(datname))) FROM pg_database;
  ```

Throughout, replace `magda` with your Helm release name and `magda` (namespace)
with your install namespace. The commands assume the default **combined-db**
topology; for a per-service (`useInK8sDbInstance`) topology see
[Per-service topology](#per-service-topology) at the end.

## Step 1 — Provision and confirm reachability

Create the managed instance and confirm a pod in the cluster can reach it. A quick
check from a throwaway client pod:

```bash
kubectl run pg-check --namespace magda --rm -it --restart=Never \
  --image=postgres:17 -- \
  psql "host=<MANAGED_ENDPOINT> port=5432 user=<MASTER_USER> dbname=postgres sslmode=require" -c '\conninfo'
```

(You will be prompted for the master password.) Most managed services require TLS;
`sslmode=require` satisfies AWS RDS `rds.force_ssl=1` and Azure's enforced TLS. If
your provider does not enforce TLS you may use `sslmode=disable`.

## Step 2 — Stop application writes

To make the dump a single consistent point, stop everything that writes to the
database before you dump. The safest option is a brief full downtime — scale the
writing services to zero:

```bash
kubectl scale deployment --namespace magda --replicas=0 \
  registry-api-full authorization-api content-api tenant-api gateway
```

Also stop any running connectors and minions (they write to the registry). Read
traffic can continue if you only scale down the writers, but a clean cutover is
simplest with everything paused.

> Confirm the exact Deployment names in your release with
> `kubectl get deploy -n magda`; they are prefixed by conventions your values may
> change.

## Step 3 — Create roles, restore each database, grant `client`

Run everything **from inside the cluster** so it can reach both the in-cluster
database Service and the managed endpoint. The steps below all run in one
throwaway `postgres:17` pod. First gather the passwords:

```bash
# In-cluster superuser password (default combined-db install)
export SRC_PASSWORD=$(kubectl get secret db-main-account-secret -n magda \
  -o jsonpath='{.data.postgresql-password}' | base64 --decode)
# The app 'client' role's password, so it matches after cutover (see Step 5)
export CLIENT_PASSWORD=$(kubectl get secret combined-db-password -n magda \
  -o jsonpath='{.data.password}' | base64 --decode)
# The managed instance's master password
export DST_PASSWORD='<MASTER_PASSWORD>'
```

Then open a shell in a client pod:

```bash
kubectl run pg-migrate --namespace magda --rm -i --restart=Never \
  --image=postgres:17 \
  --env=SRC_PASSWORD="$SRC_PASSWORD" \
  --env=CLIENT_PASSWORD="$CLIENT_PASSWORD" \
  --env=DST_PASSWORD="$DST_PASSWORD" \
  --command -- sh
```

Inside that shell, set the two connection strings. The in-cluster v6 database
speaks plaintext (`sslmode=disable`); the managed database almost always requires
TLS (`sslmode=require`, which satisfies AWS RDS `rds.force_ssl=1` and Azure's
enforced TLS):

```sh
SRC="host=combined-db-postgresql port=5432 user=postgres sslmode=disable"
DST="host=<MANAGED_ENDPOINT> port=5432 user=<MASTER_USER> sslmode=require"
export PGPASSWORD="$DST_PASSWORD"
set -e
```

**1. Create the `client` login role** with the same password Magda already uses,
so the credentials line up after cutover (see Step 5):

```sh
psql "$DST dbname=postgres" -v ON_ERROR_STOP=1 \
  -c "CREATE ROLE client LOGIN PASSWORD '$CLIENT_PASSWORD';"
```

**2. Restore each database.** Dump with `--no-owner --no-privileges` so objects
are created owned by your master account (not the source's superuser, which does
not exist on a managed service), and pipe straight in. The registry's tables live
in the shared `postgres` database, which already exists on the target, so it is
restored in place rather than created:

```sh
# Application databases — created fresh, then restored
for db in auth content session tenant; do   # drop 'tenant' if you don't run multi-tenancy
  psql "$DST dbname=postgres" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$db\";"
  PGPASSWORD="$SRC_PASSWORD" pg_dump "$SRC dbname=$db" --no-owner --no-privileges \
    | PGPASSWORD="$DST_PASSWORD" psql "$DST dbname=$db" -v ON_ERROR_STOP=1
done

# Registry data — lives in the shared 'postgres' database (there is no 'registry' db)
PGPASSWORD="$SRC_PASSWORD" pg_dump "$SRC dbname=postgres" --no-owner --no-privileges \
  | PGPASSWORD="$DST_PASSWORD" psql "$DST dbname=postgres" -v ON_ERROR_STOP=1
```

> **Two grants the registry restore into `postgres` may need on a managed DB**,
> because your master is not a superuser. Apply them once (as the master if it has
> the rights, or via your provider's console / admin role such as RDS
> `rds_superuser`), then re-run the registry restore:
>
> - **`permission denied for schema public`** — the master cannot create objects
>   in the `postgres` database's `public` schema:
>   `GRANT CREATE, USAGE ON SCHEMA public TO "<MASTER_USER>";`
> - **`permission denied to create extension "uuid-ossp"`** — the registry schema
>   creates the `uuid-ossp` extension. It is a *trusted* extension (PostgreSQL 13+),
>   so no superuser is required, but the master needs `CREATE` on the database:
>   `GRANT CREATE ON DATABASE postgres TO "<MASTER_USER>";` (On some providers you
>   instead pre-create it from the console: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`.)
>
> Both were needed in the minikube verification against a non-superuser master.

**3. Grant `client` its privileges** in every database — this replaces the grants
the in-cluster migrators normally set up, and includes default privileges so
tables created later by the v7 migrators are also reachable:

```sh
for db in auth content session tenant postgres; do   # match the databases you restored
  PGPASSWORD="$DST_PASSWORD" psql "$DST dbname=$db" -v ON_ERROR_STOP=1 <<'SQL'
GRANT USAGE ON SCHEMA public TO client;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO client;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO client;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO client;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO client;
SQL
done
```

Notes:

- Using the **PostgreSQL 17 client** to dump a PostgreSQL 13 server is supported and
  recommended (dump with a client at least as new as the source).
- `pg_dump` preserves each table's rows **and its sequences' current values**, so
  auto-increment columns (e.g. the registry's `events` sequence) continue from
  where they left off.
- `--no-privileges` drops the source's grants (which reference in-cluster-only
  roles); step 3 re-establishes exactly the grants `client` needs.

## Step 4 — Verify the restore

Confirm the databases restored and, crucially, that **`client` itself** can read
the data over TLS — this is how Magda's services will connect, so it catches both
missing data and missing grants:

```bash
kubectl run pg-check --namespace magda --rm -it --restart=Never \
  --image=postgres:17 --env=CP='<CLIENT_PASSWORD>' -- sh -c '
    C="host=<MANAGED_ENDPOINT> port=5432 user=client sslmode=require"
    PGPASSWORD=$CP psql "$C dbname=postgres" -c "\l" -c "\dt" \
      -c "SELECT count(*) FROM records;"   # registry data in the postgres db
  '
```

Confirm that:

- A default combined-db install shows `auth`, `content` and `session` as
  databases, plus `tenant` if you run multi-tenancy. **There is no `registry`
  database** — the registry's tables (`records`, `aspects`, `events`,
  `recordaspects`, `webhooks`, `webhookevents`, `eventtypes`) live in the
  `postgres` database, because `registry-api` connects with no `POSTGRES_DB`.
- Those registry tables are present in the `postgres` database with the row counts
  you expect, and the `SELECT count(*) FROM records` above **succeeds as `client`**
  (not just as the master) — that proves both the data and the grants landed.
- The `client` role's password matches the `combined-db-password` secret
  (key `password`) you used in Step 3, so Magda's services authenticate after
  cutover without any secret change.

## Step 5 — Cut over to the managed database (upgrade to v7)

Cut over by upgrading **straight to v7** with the external-database values — do
**not** run an intermediate `helm upgrade` that points your *current* version at
the managed database first (see the caveat below for why). This single upgrade
switches every service to the managed instance and re-runs the schema migrators
against it.

First, create (or update) the master-account secret the migrators use — it holds
the **managed master** password and is separate from the app's `client`
credentials:

```bash
kubectl create secret generic db-main-account-secret --namespace magda \
  --from-literal=postgresql-password='<MASTER_PASSWORD>' \
  --dry-run=client -o yaml | kubectl apply -f -
```

Then upgrade to v7 with the external-database values (the v7 master-username key is
`global.postgresql.auth.username`):

```yaml
global:
  useCombinedDb: false
  useCloudSql: false
  useAwsRdsDb: true                       # generic direct-endpoint path — RDS and Azure DB
  awsRdsEndpoint: "<MANAGED_ENDPOINT>"    # e.g. mydb.abc123.ap-southeast-2.rds.amazonaws.com
  postgresql:
    auth:
      username: "<MASTER_USER>"           # master/admin role on the managed instance
    # client sslmode: `require` (default) suits RDS/Azure; use `disable` only for a plaintext DB
    # client:
    #   sslmode: require
```

```bash
helm upgrade magda <chart> --namespace magda -f your-values.yaml --timeout 3600s
```

- Leave **`tags.combined-db: true`** (the default). Even with no in-cluster
  database, the `combined-db` chart is what creates and preserves the
  `combined-db-password` secret holding the `client` credentials your services use.
- Do **not** pass `--reuse-values` — v7 restructured the PostgreSQL values contract
  (`auth.*`, TLS), and reusing the old computed values trips the `validate-tls`
  guard. Re-supply your values with `-f`.
- Do **not** set any `majorUpgrade.*` value — it applies only to the in-cluster
  option and has no effect on an external database.
- Use a generous `--timeout`; the schema migrators run as hooks and the default 5
  minutes is too short.

Setting `useCombinedDb: false` + `useAwsRdsDb: true` turns every `*-db` Service
(`authorization-db`, `content-db`, `session-db`, `registry-db`, `tenant-db`) into a
Kubernetes `ExternalName` alias for `awsRdsEndpoint`, so all services resolve to
your single managed instance. The value paths above are `global.*` and apply
unprefixed even on the umbrella `magda` chart. The migrators find the schema and
data already present (from Step 3), so they are effectively no-ops or forward
migrations, not a reload.

Then verify: the gateway is reachable, dataset search returns your existing data,
`GET /api/v0/registry/records/<a known id>` returns it from the managed DB, and
login works.

> **Why go straight to v7 rather than switching the managed DB in while still on
> your current version?** Magda's **v7** DB migrators are TLS-aware — they set
> `PGSSLMODE=require` and carry it into the Flyway (pgjdbc) connection URL, so they
> connect to a TLS-enforcing managed database. **Pre-v7 migrators do not**: their
> Flyway URL omits `sslmode`, so against a managed database that enforces TLS (AWS
> RDS `rds.force_ssl`, Azure) the migrator hook fails with
> `FATAL: no pg_hba.conf entry ... no encryption` and the upgrade fails — even
> though the running services (which do append `sslmode`) would connect fine. So a
> "point my current version at the managed DB first, then upgrade" sequence only
> works if the managed database does not enforce TLS during that window; with an
> enforced-TLS managed database, cut over at the v7 upgrade as above. (Verified on
> minikube against a non-superuser, TLS-enforcing PostgreSQL 17 target.)

## Step 6 — Decommission the in-cluster database

Once v7 is healthy on the managed database and you are confident you will not roll
back:

1. Confirm no service still points in-cluster (all `*-db` Services are
   `ExternalName`): `kubectl get svc -n magda | grep -E 'authorization-db|content-db|session-db|registry-db|tenant-db'`.
2. Delete the old in-cluster PostgreSQL data PVC(s) (`data-combined-db-postgresql-0`,
   or `data-<db>-postgresql-0` per service) once you no longer need them for
   rollback. Until deleted they consume storage but are otherwise inert.
3. If you had wal-g backups configured for the in-cluster instance, remember they
   are now a dead-end PostgreSQL 13 chain (see the wal-g note above) — your managed
   provider owns backups from here on.

## Rolling back

Because `pg_dump` only **reads** the in-cluster database, the source is
untouched by this migration. If anything goes wrong before you delete the
in-cluster PVCs, revert the `helm upgrade` from Step 5 (restore `useCombinedDb:
true` and drop the external-DB values, or `helm rollback`), and Magda goes back to
the in-cluster PostgreSQL 13 instance with its data exactly as it was.

## Per-service topology

If you run individual in-cluster instances (`global.useCombinedDb: false` with
`global.useInK8sDbInstance.<db>: true`) rather than a combined database, each
service has its own PostgreSQL pod and Service (`authorization-db-postgresql`,
`content-db-postgresql`, …), each with its own `postgres` database holding that
service's data. In Step 3, point `SRC` at each service's Service name in turn
(`host=<db>-postgresql`) and `pg_dump` its `postgres` database into the matching
target database, then set `global.useInK8sDbInstance.<db>: false` for every service
alongside the external-DB values in Step 5. All services still resolve to the
single `awsRdsEndpoint`.

## See also

- [PostgreSQL Upgrade & Migration Pathways](../postgres-upgrade-migration-pathways.md) — the overview and how to pick a pathway.
- [Deploy Magda on AWS EKS](../deploy-to-aws.md) / [Azure AKS](../deploy-to-azure.md) — external-database provisioning and the value contract.
- [Upgrading Google Cloud SQL using Google DMS](./upgrade-google-cloud-sql-using-google-dms.md) — a provider-driven major upgrade of an already-managed database.
- [In-cluster Database Backup & Restore — How It Works](../in-cluster-database-backup-and-restore.md) — why wal-g is a rollback net, not a migration tool.
- [E2E test case: migrate the in-cluster PostgreSQL to a managed/cloud database](../e2e-test-cases/postgres-in-cluster-to-managed-db-migration.md) — a repeatable gate for this procedure against a simulated (TLS-enforced, non-superuser-master) managed DB.
