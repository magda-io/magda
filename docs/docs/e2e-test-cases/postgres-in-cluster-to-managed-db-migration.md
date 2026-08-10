# E2E Test Case: migrate the in-cluster PostgreSQL to a managed/cloud database (Pathway B)

A step-by-step end-to-end test for **Pathway B** — moving off the bundled
in-cluster PostgreSQL onto a managed/cloud database — run against a real cluster
(e.g. minikube). It gates the operator procedure in
[How to migrate the in-cluster database to a managed / cloud database](../migration/in-cluster-postgres-to-managed-db.md),
which explains what each step does and why.

Because a CI cluster has no real RDS/Azure/Cloud SQL instance, the managed
database is **simulated in-cluster** by a stock `postgres:17` pod configured with
the two constraints that actually break a naive migration:

- **TLS is enforced** — a `hostssl`-only `pg_hba.conf`, mimicking AWS RDS
  `rds.force_ssl=1` / Azure's enforced TLS. A non-TLS TCP client is rejected.
- **The master account is not a superuser** — a `CREATEDB CREATEROLE` but
  `NOSUPERUSER` role, mimicking an RDS master. This is the constraint that makes a
  single `pg_dumpall` restore fail and silently drop data, and is the whole reason
  the how-to uses per-database `pg_dump --no-owner --no-privileges` + explicit
  `client` grants.

This mirrors how
[DB TLS + non-default privileged user](./db-tls-and-privileged-user.md) fakes
provider constraints locally. It validates the migration **mechanics**, not any
one vendor's exact privilege model (see Notes).

## What it covers

1. **Deploy a simulated managed DB** (TLS-enforced, non-superuser master).
2. **Install v6, seed data** via the registry and auth APIs (identical to the
   [Pathway A case](./postgres-major-upgrade.md), step 1).
3. **Negative control** — show that the naive `pg_dumpall | psql` as the
   non-superuser master fails and loses the registry data in the shared
   `postgres` database.
4. **Migrate with the documented per-database procedure** — create `client`,
   `pg_dump --no-owner --no-privileges` each database, grant `client` — and assert
   every database, its row counts, sequences, and `client`'s own read/write access
   landed on the managed DB over TLS.
5. **Cut over by upgrading to v7** pointed at the managed DB, and assert the
   migrators connect over TLS, the application is healthy, and the seeded dataset
   is served through the API from the managed DB. (Includes the verified reason to
   cut over at v7 rather than pointing an earlier version at the managed DB first.)

## Prerequisites

- A cluster with your `kubectl` context pointed at it (e.g. `minikube start`),
  plus `helm` and `openssl`.
- A published **v6** chart version (default `global.useCombinedDb: true`,
  bundled PostgreSQL 13) and a published **v7** build (a real release, or a
  [PR preview / branch build](../ci-version-release.md)).
- [`@magda/acs-cmd`](https://www.npmjs.com/package/@magda/acs-cmd) available via
  `yarn acs-cmd` (to mint an admin session JWT), as in the Pathway A case.

```bash
export NS=pg-managed-migration-e2e
export V6_VERSION=6.2.0
export V7_VERSION=7.0.0-pr.3750.1
export MANAGED_HOST=managed-pg.$NS.svc.cluster.local   # the simulated managed endpoint
export MASTER_USER=magda_admin
export MASTER_PW=dstpass
kubectl create namespace "$NS"
```

## 0. Deploy the simulated managed database

Generate a self-signed server certificate and load it, plus the TLS-enforcing
`pg_hba.conf` and a non-superuser master role, into the namespace:

```bash
cd $(mktemp -d)
openssl req -new -x509 -days 365 -nodes -text -out server.crt -keyout server.key \
  -subj "/CN=managed-pg" -addext "subjectAltName=DNS:managed-pg"
kubectl -n "$NS" create secret generic managed-certs \
  --from-file=server.crt=server.crt --from-file=server.key=server.key

cat > pg_hba.conf <<'EOF'
local   all   all                trust
# TCP MUST use TLS (mimics RDS rds.force_ssl / Azure): only hostssl lines
hostssl all   all   0.0.0.0/0    md5
hostssl all   all   ::/0         md5
EOF
cat > init.sql <<EOF
-- master account: privileged but NOT a superuser (mimics an RDS master)
CREATE ROLE $MASTER_USER WITH LOGIN CREATEDB CREATEROLE PASSWORD '$MASTER_PW';
EOF
kubectl -n "$NS" create configmap managed-pgcfg \
  --from-file=pg_hba.conf=pg_hba.conf --from-file=init.sql=init.sql
```

```bash
kubectl -n "$NS" apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata: { name: managed-pg, labels: { app: managed-pg } }
spec:
  initContainers:
    - name: prep-certs
      image: busybox:1.36
      command: ["sh","-c","cp /in/* /certs/ && chown 999:999 /certs/server.* && chmod 600 /certs/server.key && chmod 644 /certs/server.crt"]
      volumeMounts: [{ name: certs-in, mountPath: /in }, { name: certs, mountPath: /certs }]
  containers:
    - name: pg
      image: postgres:17
      env: [{ name: POSTGRES_PASSWORD, value: bootstrap }]
      args: ["-c","ssl=on","-c","ssl_cert_file=/certs/server.crt","-c","ssl_key_file=/certs/server.key","-c","hba_file=/etc/pgcfg/pg_hba.conf"]
      volumeMounts:
        - { name: certs, mountPath: /certs }
        - { name: pgcfg, mountPath: /etc/pgcfg }
        - { name: initdb, mountPath: /docker-entrypoint-initdb.d }
  volumes:
    - { name: certs-in, secret: { secretName: managed-certs } }
    - { name: certs, emptyDir: {} }
    - name: pgcfg
      configMap: { name: managed-pgcfg, items: [{ key: pg_hba.conf, path: pg_hba.conf }] }
    - name: initdb
      configMap: { name: managed-pgcfg, items: [{ key: init.sql, path: init.sql }] }
---
apiVersion: v1
kind: Service
metadata: { name: managed-pg }
spec: { selector: { app: managed-pg }, ports: [{ port: 5432, targetPort: 5432 }] }
EOF
kubectl -n "$NS" wait --for=condition=Ready pod/managed-pg --timeout=180s
```

Assert TLS is enforced (this is what a managed provider does):

```bash
kubectl run tlscheck -n "$NS" --rm -i --restart=Never --image=postgres:17 \
  --env=P="$MASTER_PW" --command -- sh -c "
    echo '--- sslmode=disable (expect REJECTED) ---'
    PGPASSWORD=\$P psql 'host=managed-pg user=$MASTER_USER dbname=postgres sslmode=disable' -tAc 'SELECT 1' 2>&1 | head -1
    echo '--- sslmode=require (expect ssl=true) ---'
    PGPASSWORD=\$P psql 'host=managed-pg user=$MASTER_USER dbname=postgres sslmode=require' -tAc \
      \"SELECT 'ssl='||ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid();\" 2>&1 | head -1
  "
# expect: the disable attempt fails with 'no pg_hba.conf entry ... no encryption';
#         the require attempt prints 'ssl=t'
```

## 1. Install v6 and seed data

Follow [Pathway A case, step 1](./postgres-major-upgrade.md#1-install-v6-and-seed-data)
verbatim (install v6, port-forward the gateway, seed one registry record and one
auth user, record counts). In brief:

```bash
helm install magda oci://ghcr.io/magda-io/charts/magda --version "$V6_VERSION" -n "$NS" \
  --wait --timeout 3600s
export PGPASSWORD=$(kubectl get secret -n "$NS" db-main-account-secret -o jsonpath='{.data.postgresql-password}' | base64 -d)
export CLIENT_PW=$(kubectl get secret -n "$NS" combined-db-password -o jsonpath='{.data.password}' | base64 -d)
# ... seed a registry record + auth user via the gateway (see Pathway A step 1) ...
# capture the dataset id you PUT — step 5 reads it back through the API:
echo "<your-dataset-id>" > /tmp/dsid.txt
kubectl -n "$NS" exec combined-db-postgresql-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -d postgres -tAc "SELECT count(*) FROM records;" | tee /tmp/registry-count.txt
kubectl -n "$NS" exec combined-db-postgresql-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -d auth -tAc "SELECT count(*) FROM users;" | tee /tmp/auth-count.txt
```

> The admin session JWT (`X-Magda-Session`) is `jwt.sign({userId, session:{}}, jwtSecret)`
> for the built-in admin `00000000-0000-4000-8000-000000000000`. If `acs-cmd` isn't
> handy, mint it with the `jwt-secret` from the `auth-secrets` secret:
> `node -e "console.log(require('jsonwebtoken').sign({userId:'00000000-0000-4000-8000-000000000000',session:{}}, process.argv[1]))" "$JWT_SECRET"`.

## 2. Stop application writes

```bash
kubectl -n "$NS" scale deployment --replicas=0 \
  $(kubectl -n "$NS" get deploy -o name | grep -E 'registry-api|authorization-api|content-api|tenant-api|gateway' | paste -sd' ' -)
```

Also stop any connectors/minions. (Read-only is fine, but a clean cutover is
simplest with writers paused.)

## 3. Negative control — the naive `pg_dumpall` loses data

This step demonstrates *why* the how-to does not use `pg_dumpall`; skip it if you
only want the passing path. Run the single-stream `pg_dumpall` as the
non-superuser master and observe it fail partway:

```bash
kubectl run pg-dumpall-bad -n "$NS" --rm -i --restart=Never --image=postgres:17 \
  --env=SRC="$PGPASSWORD" --env=DST="$MASTER_PW" --command -- sh -c "
    PGPASSWORD=\$SRC pg_dumpall --host=combined-db-postgresql --username=postgres \
    | PGPASSWORD=\$DST psql 'host=managed-pg user=$MASTER_USER dbname=postgres sslmode=require'
  " 2>&1 | grep -iE 'must be able to SET ROLE|must be owner|permission denied|does not exist' | sort | uniq -c
# expect: 'must be able to SET ROLE "postgres"/"client"' and, as a consequence,
#         'relation ... does not exist' — the registry tables never got created.
kubectl exec -n "$NS" managed-pg -- env PGPASSWORD=bootstrap \
  psql -U postgres -d postgres -tAc "SELECT count(*) FROM records;" 2>&1 | head -1
# expect: ERROR: relation "records" does not exist  -> registry data was silently dropped
```

Then reset the target before the real run:

```bash
kubectl exec -n "$NS" managed-pg -- env PGPASSWORD=bootstrap psql -U postgres -v ON_ERROR_STOP=0 -c "
  DROP DATABASE IF EXISTS auth; DROP DATABASE IF EXISTS content;
  DROP DATABASE IF EXISTS session; DROP DATABASE IF EXISTS tenant;
  REASSIGN OWNED BY client TO postgres; DROP OWNED BY client; DROP ROLE IF EXISTS client;
  GRANT CREATE, USAGE ON SCHEMA public TO $MASTER_USER;
  GRANT CREATE ON DATABASE postgres TO $MASTER_USER;"   # let the master manage the shared postgres db
```

> The two `GRANT`s model what a managed provider's admin (e.g. `rds_superuser`) can
> do to the shared `postgres` database. Both were needed in verification: the
> schema grant so the master can create the registry tables in `public`, and the
> database grant so it can `CREATE EXTENSION "uuid-ossp"` (a trusted extension —
> no superuser required, but `CREATE` on the database is). On a real provider you
> either already have these or run them once from the provider console; see the
> how-to's Step 3 note.

## 4. Migrate with the documented per-database procedure

Run exactly [the how-to's Step 3](../migration/in-cluster-postgres-to-managed-db.md#step-3--create-roles-restore-each-database-grant-client):
create `client`, `pg_dump --no-owner --no-privileges` each database into the
managed DB, grant `client`. Condensed into one pod:

```bash
kubectl run pg-migrate -n "$NS" --rm -i --restart=Never --image=postgres:17 \
  --env=SRC="$PGPASSWORD" --env=CLIENT_PW="$CLIENT_PW" --env=DST="$MASTER_PW" --command -- sh -c '
set -e; set -o pipefail
SRC_C="host=combined-db-postgresql user=postgres sslmode=disable"
DST_C="host=managed-pg user='"$MASTER_USER"' sslmode=require"
export PGPASSWORD=$DST
psql "$DST_C dbname=postgres" -v ON_ERROR_STOP=1 -c "CREATE ROLE client LOGIN PASSWORD '"'"'$CLIENT_PW'"'"';"
for db in auth content session tenant; do
  psql "$DST_C dbname=postgres" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$db\";"
  PGPASSWORD=$SRC pg_dump "$SRC_C dbname=$db" --no-owner --no-privileges | psql "$DST_C dbname=$db" -v ON_ERROR_STOP=1 >/dev/null
done
PGPASSWORD=$SRC pg_dump "$SRC_C dbname=postgres" --no-owner --no-privileges | psql "$DST_C dbname=postgres" -v ON_ERROR_STOP=1 >/dev/null
for db in auth content session tenant postgres; do
  psql "$DST_C dbname=$db" -v ON_ERROR_STOP=1 >/dev/null <<SQL
GRANT USAGE ON SCHEMA public TO client;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO client;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO client;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO client;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO client;
SQL
done
echo "migration complete"'
# expect: no pg_dump/psql errors, ending "migration complete"
```

Assert the data landed and — crucially — that **`client` itself** can read it over
TLS (this catches both missing data and missing grants):

```bash
kubectl run verify -n "$NS" --rm -i --restart=Never --image=postgres:17 \
  --env=CP="$CLIENT_PW" --command -- sh -c "
    C='host=managed-pg user=client sslmode=require'
    PGPASSWORD=\$CP psql \"\$C dbname=postgres\" -tAc 'SELECT count(*) FROM records;'
    PGPASSWORD=\$CP psql \"\$C dbname=auth\"     -tAc 'SELECT count(*) FROM users;'
    PGPASSWORD=\$CP psql \"\$C dbname=postgres\" -tAc \"SELECT datname FROM pg_database WHERE datname NOT LIKE 'template%' AND datname <> '$MASTER_USER' ORDER BY 1;\"
  "
# expect: records count == /tmp/registry-count.txt; users count == /tmp/auth-count.txt;
#         databases auth/content/postgres/session/tenant present, NO 'registry' db.
```

## 5. Cut over to the managed database (upgrade to v7)

Point the master-account secret at the managed master, then **upgrade straight to
v7** with the external-DB values — do not point v6 at the managed DB first (see the
caveat below):

```bash
kubectl create secret generic db-main-account-secret -n "$NS" \
  --from-literal=postgresql-password="$MASTER_PW" --dry-run=client -o yaml | kubectl apply -f -

helm upgrade magda oci://ghcr.io/magda-io/charts/magda --version "$V7_VERSION" -n "$NS" \
  --set global.useCombinedDb=false \
  --set global.useAwsRdsDb=true \
  --set global.awsRdsEndpoint="$MANAGED_HOST" \
  --set global.postgresql.auth.username="$MASTER_USER" \
  --wait --timeout 3600s
```

> Do **not** pass `--reuse-values` (v7 restructured the values contract and it trips
> the `validate-tls` guard), and do **not** set any `majorUpgrade.*` value (no effect
> on an external DB). The upgrade must **succeed** — its post-upgrade migrator hooks
> connect to the managed DB over TLS.

Assert the switch and health:

```bash
kubectl -n "$NS" get svc authorization-db content-db session-db registry-db -o \
  custom-columns=NAME:.metadata.name,TYPE:.spec.type,TO:.spec.externalName
# expect: all type ExternalName -> $MANAGED_HOST
kubectl -n "$NS" port-forward svc/gateway 18080:80 & sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:18080/api/v0/auth/users/whoami   # 200
curl -s "http://localhost:18080/api/v0/registry/records/$(cat /tmp/dsid.txt)" -H "X-Magda-Tenant-Id: 0" | head -c 200
# expect: the seeded record, served THROUGH THE APP from the managed DB over TLS
kubectl run verify7 -n "$NS" --rm -i --restart=Never --image=postgres:17 \
  --env=CP="$CLIENT_PW" --command -- sh -c "
    PGPASSWORD=\$CP psql 'host=managed-pg user=client dbname=postgres sslmode=require' -tAc 'SELECT count(*) FROM records;'
  "
# expect: still == /tmp/registry-count.txt
```

> **Why cut over at the v7 upgrade, not by pointing v6 at the managed DB first?**
> Verified negative result: a `helm upgrade` that points a **pre-v7** release at a
> TLS-enforcing managed DB **fails** at the `registry-db-migrator` post-upgrade hook
> with `FATAL: no pg_hba.conf entry ... no encryption`. Pre-v7 migrators build their
> Flyway (pgjdbc) URL without an `sslmode` parameter, so they connect in plaintext
> and the managed DB rejects them — even though the running services (which append
> `sslmode`) connect fine. v7 migrators set `PGSSLMODE=require` and carry it into the
> Flyway URL, so the v7 upgrade's migrators connect over TLS. (If you want to
> reproduce the failure: run the v6 `helm upgrade` with the external-DB values and
> observe the `registry-db-migrator` job fail.)

## Cleanup

```bash
kill %1 2>/dev/null   # the gateway port-forward
helm uninstall magda -n "$NS"
kubectl delete namespace "$NS" --wait=true --timeout=300s
rm -f /tmp/registry-count.txt /tmp/auth-count.txt /tmp/admin.jwt /tmp/dsid.txt
```

## Notes

- **What is simulated vs. real.** The managed database is a local `postgres:17`
  pod with TLS enforced and a non-superuser master — the two constraints that
  govern the migration mechanics. It is **not** a substitute for validating
  against a specific vendor's exact privilege model (RDS `rds_superuser`, Cloud
  SQL's `cloudsqlsuperuser`, Azure's `azure_pg_admin`); the shared-`postgres`-db
  `GRANT` in step 3 approximates what those admin roles allow.
- **What has been exercised locally.** The **whole flow was run end-to-end on
  minikube** (v6 `6.1.2-pr.3759.0` → simulated managed PG17 → v7 `7.0.0-pr.3762.4`):
  TLS enforcement, the negative `pg_dumpall` control, the per-database migration
  with `client` read/write over TLS, and the v7 cutover — after which `whoami`
  returned 200 and the seeded dataset was served through the registry API from the
  managed DB, row counts intact. Two findings came out of it and are baked into the
  steps above and the how-to:
  - The registry restore needs **`CREATE ON DATABASE`** on the target (for the
    trusted `uuid-ossp` extension) in addition to `CREATE ON SCHEMA public` — a
    non-superuser master has neither by default (step 3 grants both).
  - **Pre-v7 migrators cannot reach a TLS-enforcing managed DB** (Flyway URL omits
    `sslmode`), so the cutover must happen **at** the v7 upgrade, not before it
    (step 5 caveat).
- Run this whenever the Pathway B how-to or the external-DB value contract
  (`useAwsRdsDb`/`awsRdsEndpoint`, the master-username key, `sslmode` handling)
  changes.
- On Apple-Silicon minikube the amd64 Magda images run under emulation — size the
  `--timeout` and waits accordingly, as in the Pathway A case.
- See also
  [How to migrate the in-cluster database to a managed / cloud database](../migration/in-cluster-postgres-to-managed-db.md)
  (operator explanation) and
  [PostgreSQL Upgrade & Migration Pathways](../postgres-upgrade-migration-pathways.md)
  (how to pick a pathway).
