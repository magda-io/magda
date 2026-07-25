# E2E Test Case: DB TLS + non-default privileged user

A concrete, scripted set of end-to-end cases covering encrypted-by-default
PostgreSQL connections and support for a non-default privileged DB username,
run against a real cluster (e.g. minikube). Cases run mostly at the `kubectl exec` / DB level rather than through the gateway, since what's being verified
is the connection itself (is it encrypted? which account is it using?) — a
couple also reuse the shared gateway + API-key setup from
[Feature-specific testing through the gateway with an API key](../e2e-cluster-deployment-test.md#feature-specific-testing-through-the-gateway-with-an-api-key)
to confirm the stack is fully functional, not just that the DB layer looks
right in isolation.

## What it covers

By default, Magda now:

- Serves TLS on the in-cluster PostgreSQL instance (`global.postgresql.tls.enabled`,
  default `true`), using a self-signed certificate Magda generates and
  preserves across upgrades.
- Encrypts every service-to-database connection (`global.postgresql.client.sslmode`,
  resolved to `require` by default), injected as `PGSSLMODE` for the Node
  services and the backup/auto-vacuum jobs, and as an `sslmode=` JDBC URL
  parameter for the Flyway-based DB migrators.
- Supports a non-default privileged (`postgresqlUsername`) account for the
  in-cluster database via an initdb hook that grants it `CREATEDB` /
  `CREATEROLE` (not `SUPERUSER`) — matching the privilege level managed
  providers (RDS `rds_superuser`, Azure `azure_pg_admin`, GCP
  `cloudsqlsuperuser`) grant their admin account.

On a **default render**, `PGSSLMODE` is carried on 9 components: the 4 Node
services that talk to Postgres directly (`authorization-api`, `content-api`,
`gateway`, `registry-api`), the 4 migrator Jobs (`authorization-db`,
`content-db`, `registry-db`, `session-db`), and the `registry-db` auto-vacuum
CronJob. With `global.enableMultiTenants=true`, `tenant-api` and the
`tenant-db` migrator also render, bringing the total to 11.

The objective assertion used throughout — run against the DB pod as the
built-in `postgres` superuser — is:

```sql
SELECT a.datname, a.usename, s.ssl, s.version
FROM pg_stat_ssl s JOIN pg_stat_activity a USING (pid)
WHERE a.usename IS NOT NULL;
```

`ssl = t` (with a TLS version, e.g. `TLSv1.3`) confirms the backend
negotiated TLS for that connection; `ssl = f` confirms it did not.

## Setup

These cases exec directly into the primary PostgreSQL pod rather than port-forwarding, since several assertions need the in-pod `$POSTGRES_POSTGRES_PASSWORD` environment variable (the built-in `postgres` superuser's password, distinct from the custom privileged user's password when one is configured):

```bash
DBPOD=$(kubectl get pod -n magda -l app.kubernetes.io/name=combined-db-postgresql -o name | head -1)
```

(Substitute the appropriate pod selector if you're running against a
non-combined DB topology.)

## Case C1 — fresh install, stock defaults

Verifies TLS is on for every logical database and every connecting role with
zero extra configuration.

```bash
kubectl create namespace magda
helm install magda oci://ghcr.io/magda-io/charts/magda -n magda
# wait until settled
kubectl get pods -n magda --no-headers | grep -vE "Running|Completed"   # expect empty

DBPOD=$(kubectl get pod -n magda -l app.kubernetes.io/name=combined-db-postgresql -o name | head -1)
kubectl exec -n magda $DBPOD -- bash -c \
  'PGPASSWORD=$POSTGRES_POSTGRES_PASSWORD psql -U postgres -c "
    SELECT a.datname, a.usename, s.ssl, s.version
    FROM pg_stat_ssl s JOIN pg_stat_activity a USING (pid)
    WHERE a.usename IS NOT NULL ORDER BY 1,2;"'
```

Expected: `ssl = t` for every `client` backend across all logical databases,
and for `registry-api`'s own connection. All migrator Jobs `Completed`.

## Case C2 — fresh install, hardening profile

The headline case: TLS-by-default **and** a non-default privileged username
together, with no manually created secret and no manual grant.

```bash
kubectl create namespace magda
helm install magda oci://ghcr.io/magda-io/charts/magda -n magda \
  --set global.postgresql.postgresqlUsername=magda_admin
```

```bash
# both password keys were auto-created
kubectl get secret -n magda db-main-account-secret -o jsonpath='{.data}' | tr ',' '\n'
# expect BOTH postgresql-password (magda_admin's) AND postgresql-postgres-password (the built-in postgres superuser's)

# magda_admin has Create role + Create DB, but is NOT a superuser
DBPOD=$(kubectl get pod -n magda -l app.kubernetes.io/name=combined-db-postgresql -o name | head -1)
kubectl exec -n magda $DBPOD -- bash -c \
  'PGPASSWORD=$POSTGRES_POSTGRES_PASSWORD psql -U postgres -tAc "\du magda_admin"'
# expect: Create role, Create DB -- and NOT Superuser

# the restricted `client` role was created by the migrators, using magda_admin
kubectl exec -n magda $DBPOD -- bash -c \
  'PGPASSWORD=$POSTGRES_POSTGRES_PASSWORD psql -U postgres -tAc "\du client"'

# every `client`-role connection is TLS
kubectl exec -n magda $DBPOD -- bash -c \
  'PGPASSWORD=$POSTGRES_POSTGRES_PASSWORD psql -U postgres -tAc "
    SELECT count(*) FILTER (WHERE s.ssl), count(*)
    FROM pg_stat_ssl s JOIN pg_stat_activity a USING (pid)
    WHERE a.usename = '"'"'client'"'"';"'
# expect both counts equal and non-zero
```

## Case C3 — upgrade in place from a pre-TLS release

The riskiest case: an existing cluster, seeded with real data, upgrading from
a release that predates both TLS and the migrator's explicit `sslmode`
support, in one step — and with no manual intervention.

```bash
kubectl create namespace magda
helm install magda oci://ghcr.io/magda-io/charts/magda --version <prior-release> -n magda
# wait until settled, then seed a dataset through the API so there is data to lose
# (see docs/docs/e2e-cluster-deployment-test.md for the gateway + API key setup)

DBPOD=$(kubectl get pod -n magda -l app.kubernetes.io/name=combined-db-postgresql -o name | head -1)
kubectl exec -n magda $DBPOD -- bash -c \
  'PGPASSWORD=$POSTGRES_POSTGRES_PASSWORD psql -U postgres -d registry -tAc \
   "SELECT max(version) FROM schema_version WHERE success"'
# record this value as BASELINE_VERSION

helm upgrade magda oci://ghcr.io/magda-io/charts/magda --version <target-release> -n magda
```

Assertions after the upgrade settles:

```bash
# migration history was baselined at the recorded version -- nothing re-applied, nothing failed
kubectl exec -n magda $DBPOD -- bash -c \
  'PGPASSWORD=$POSTGRES_POSTGRES_PASSWORD psql -U postgres -d registry -c \
   "SELECT installed_rank, version, description, type, success FROM flyway_schema_history ORDER BY installed_rank"'
# expect: rank 1 is the baseline at BASELINE_VERSION; zero rows with success = false

# TLS now in force
kubectl exec -n magda $DBPOD -- bash -c \
  'PGPASSWORD=$POSTGRES_POSTGRES_PASSWORD psql -U postgres -tAc \
   "SELECT count(*) FILTER (WHERE s.ssl), count(*) FROM pg_stat_ssl s JOIN pg_stat_activity a USING (pid) WHERE a.usename = '"'"'client'"'"';"'

# the seeded dataset is still readable through the API; nothing crash-looped
kubectl get pods -n magda --no-headers | grep -vE "Running|Completed"   # expect empty
```

Record how long the pods took to settle and whether any needed a restart —
that's the "upgrade blip" this case is really checking for.

## Case C4 — rollback / escape hatch

Confirms `global.postgresql.client.sslmode=disable` fully restores the
previous (plaintext) client behaviour, for operators who need to roll back.

```bash
helm upgrade magda oci://ghcr.io/magda-io/charts/magda -n magda \
  --set global.postgresql.client.sslmode=disable
# wait until settled
DBPOD=$(kubectl get pod -n magda -l app.kubernetes.io/name=combined-db-postgresql -o name | head -1)
kubectl exec -n magda $DBPOD -- bash -c \
  'PGPASSWORD=$POSTGRES_POSTGRES_PASSWORD psql -U postgres -tAc \
   "SELECT DISTINCT s.ssl FROM pg_stat_ssl s JOIN pg_stat_activity a USING (pid) WHERE a.usename = '"'"'client'"'"';"'
```

Expected: `f` only. The stack remains fully functional — confirm with a
search and a dataset fetch through the gateway (shared setup, as above).

`global.postgresql.tls.enabled=false` is the corresponding rollback for the
in-cluster **server**'s TLS listener, independent of the client-side setting
above.

## Case C5 — enforced-SSL external DB simulation

The closest reachable equivalent of connecting to a managed provider (RDS,
with `rds.force_ssl=1`) without needing real cloud infrastructure: stand up a
standalone PostgreSQL that **refuses** plaintext connections, then point
Magda at it exactly as if it were RDS.

```bash
kubectl create namespace extdb
# Deploy a standalone bitnami postgresql with TLS on and a non-`postgres` admin,
# then patch pg_hba.conf so only hostssl entries remain:
#   hostssl all all 0.0.0.0/0 scram-sha-256
# and reload: psql -U postgres -c "SELECT pg_reload_conf()"
# Confirm plaintext is refused:
#   PGSSLMODE=disable psql -h <svc> -U magda_admin   -> must FAIL with
#   "no pg_hba.conf entry ... no encryption"
```

Then install Magda against it:

```bash
kubectl create namespace magda
helm install magda oci://ghcr.io/magda-io/charts/magda -n magda \
  --set global.useCombinedDb=false \
  --set global.useAwsRdsDb=true \
  --set global.awsRdsEndpoint=<extdb service DNS name> \
  --set global.postgresql.postgresqlUsername=magda_admin
```

Expected: all migrators complete and every service connects successfully —
**without** relaxing the server's SSL enforcement. This also exercises the
`ExternalName` service path and the `postgresqlUsername` validation that
rejects the default `postgres` account for external databases.

## Known limitation: `CREATEDB`/`CREATEROLE` grant only runs on first boot

The grant that lets a non-default privileged user create databases and the
restricted `client` role (case C2) is delivered via a PostgreSQL **initdb**
script, which the bitnami chart only runs once, when the data directory is
first initialised. If you take an **existing** in-cluster deployment that was
installed with the default `postgres` user and later switch
`global.postgresql.postgresqlUsername` to a custom value, the grant will
**not** be applied retroactively — the new user will exist (or fail to,
depending on how it was provisioned) without the `CREATEDB`/`CREATEROLE`
privileges the chart assumes it has, and the DB migrators will fail with a
permission error.

The manual remedy is a one-time, one-line fix connected as the built-in
`postgres` superuser:

```sql
ALTER ROLE magda_admin CREATEDB CREATEROLE;
```

(substituting your actual privileged username). There is no scripted
migration for this — it's a manual step for anyone changing the privileged
username on a cluster that already has data.

## Cleanup

Between cases, purge the deployment so each starts from a clean slate:

```bash
helm uninstall magda -n magda 2>/dev/null || true
kubectl delete namespace magda --wait=true --timeout=180s 2>/dev/null || true
minikube ssh -- 'sudo rm -rf /tmp/hostpath-provisioner/magda'
kubectl get ns magda   # expect NotFound
```

For C5, also tear down the `extdb` namespace. For any case that used the
shared gateway + API-key setup, stop `minikube tunnel` and remove any
throwaway test user / API key you created.
