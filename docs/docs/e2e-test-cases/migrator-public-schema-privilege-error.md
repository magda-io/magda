# E2E Test Case: DB migrator surfaces the PG15+ `public`-schema privilege failure (and classifies a missing database locale-independently)

A step-by-step end-to-end test that `magda-db-migrator`'s `migrate.sh`
([magda-io/magda#3770](https://github.com/magda-io/magda/issues/3770),
[#3744](https://github.com/magda-io/magda/issues/3744)):

1. **turns a PostgreSQL 15+ `public`-schema privilege failure into actionable
   guidance** — when the migrator user can connect but cannot create objects in
   the target database's `public` schema, the real Flyway error
   (`SQL State : 42501`, `permission denied for schema public`) is translated
   into a message that names the database, the user and the one-time fix, and
   explicitly says it is **not** a TLS problem — while still failing the
   migrator; and
2. **classifies a genuinely-missing per-service database as benign via a catalog
   check**, not by matching the (server-localized) `... does not exist` message
   text, so it does not spuriously abort on a non-English `lc_messages` server.

Because a CI cluster has no real RDS/Azure/Cloud SQL instance, the managed
database is **simulated in-cluster** with a stock `postgres:17` pod configured
to enforce TLS, and a **non-superuser master** — exactly the
[`sslmode=verify-full`](./db-tls-verify-full.md) and
[Pathway B migration](./postgres-in-cluster-to-managed-db-migration.md) pattern.
This case is the deliberate **negative** of `db-tls-verify-full.md`'s `init.sql`:
that case runs `ALTER SCHEMA public OWNER TO <master>` so the registry migrator
can proceed; here we **omit** it, so the migrator hits `42501` — and assert the
diagnostic, rather than the raw error, is what an operator sees.

This complements the unit test
[`magda-db-migrator/tests/migrate-idempotency.sh`](https://github.com/magda-io/magda/blob/main/magda-db-migrator/tests/migrate-idempotency.sh)
(cases 4 and 5), which shim `psql`/`flyway`. What that harness cannot reach is
the thing this case exists to prove: that **real Flyway 12.x** actually emits
`SQL State : 42501` for this failure (so the translation fires), and that **real
`psql`** returns an empty result — with no error — for a missing database in the
catalog (so the benign classification works).

## What it covers

1. **Negative (42501):** a non-superuser master against a pre-created database it
   does **not** own → real Flyway fails with `SQL State : 42501` → the migrator
   prints the actionable guidance and still exits non-zero.
2. **Positive control:** run the documented fix
   (`ALTER SCHEMA public OWNER TO <master>`) and re-run → the migration succeeds,
   with **no** guidance emitted.
3. **Missing-database is benign (#3744):** a role without `CREATEDB` pointed at a
   database that does not exist → the migrator detects non-existence via the
   `pg_database` catalog and takes the benign "skipping" path, **without** the
   `could not determine ...` abort that a localized-text classifier would produce
   on a non-English server.
4. **Why a catalog check (not SQLSTATE):** a real `psql` connection to a missing
   database reports `FATAL: database "..." does not exist` with **no SQLSTATE
   line, even under `VERBOSITY=verbose`** — so the existence check cannot be done
   by parsing the connection error and must consult the catalog.

## Prerequisites

- A cluster with your `kubectl` context pointed at it (e.g. `minikube start`),
  plus `openssl`.
- The `magda-db-migrator` image **for the version under test**, available to the
  cluster. Either a published tag, or build it into the cluster from a repo
  checkout (used below):

  ```bash
  # from a magda repo checkout, into minikube's docker
  minikube image build -t magda-db-migrator:e2e magda-db-migrator
  ```

```bash
export NS=migrator-pubschema-e2e
export MASTER_USER=magda_admin
export MASTER_PW=dstpass
export MIGRATOR_IMAGE=magda-db-migrator:e2e   # imagePullPolicy: Never below assumes a locally-built image
kubectl create namespace "$NS"
```

## 0. Deploy the simulated managed database

A TLS-enforcing `postgres:17` pod with a **non-superuser master** and — the
crux — a **pre-created `registry` database owned by the bootstrap superuser, not
the master**, and **no** `ALTER SCHEMA public OWNER` / `GRANT CREATE`. On
PostgreSQL 15+ the master can connect but cannot create objects in that
database's `public` schema.

```bash
cd $(mktemp -d)
# sslmode=require does not verify the cert, so any self-signed cert works.
openssl req -new -x509 -days 365 -nodes -text -out server.crt -keyout server.key \
  -subj "/CN=managed-pg" -addext "subjectAltName=DNS:managed-pg"
kubectl -n "$NS" create secret generic managed-certs \
  --from-file=server.crt=server.crt --from-file=server.key=server.key

cat > pg_hba.conf <<'EOF'
local   all   all               trust
# TCP MUST use TLS (mimics RDS/Azure force-ssl): hostssl only
hostssl all   all   0.0.0.0/0   md5
hostssl all   all   ::/0        md5
EOF

cat > init.sql <<EOF
-- Non-superuser master, mimicking a managed-provider admin login.
CREATE ROLE $MASTER_USER WITH LOGIN CREATEDB CREATEROLE PASSWORD '$MASTER_PW';
-- A PRE-CREATED application database owned by the bootstrap superuser, NOT the
-- master (the "pre-created app DB / shared instance" case from #3770). The master
-- can connect but, on PG15+, cannot create objects in this DB's public schema.
CREATE DATABASE registry OWNER postgres;
-- DELIBERATELY OMITTED (the whole point of the negative test):
--   ALTER SCHEMA public OWNER TO $MASTER_USER;   -- or GRANT CREATE ON SCHEMA public
-- so the registry migrator connects fine over TLS and then fails Flyway with
-- permission denied for schema public (SQLSTATE 42501).
-- A role without CREATEDB, for the missing-database (#3744) part of the test.
CREATE ROLE restricted WITH LOGIN PASSWORD 'rpw' NOCREATEDB;
EOF
kubectl -n "$NS" create configmap managed-pgcfg \
  --from-file=pg_hba.conf=pg_hba.conf --from-file=init.sql=init.sql

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

Confirm the setup before going further — the master must be a non-superuser that
cannot create in `registry`'s `public` schema:

```bash
kubectl -n "$NS" exec managed-pg -- env PGPASSWORD=bootstrap psql -U postgres -tAc "
  SELECT rolsuper, rolcreatedb FROM pg_roles WHERE rolname='$MASTER_USER';"        # expect: f|t
kubectl -n "$NS" exec managed-pg -- env PGPASSWORD=bootstrap psql -U postgres -d registry -tAc "
  SELECT has_schema_privilege('$MASTER_USER','public','CREATE');"                  # expect: f
```

The two migration payloads (one per logical database the migrator will handle):

```bash
kubectl -n "$NS" create configmap registry-sql \
  --from-literal=V1__init.sql="CREATE TABLE public.e2e_probe (id int primary key, note text);"
kubectl -n "$NS" create configmap ghostdb-sql \
  --from-literal=V1__init.sql="CREATE TABLE public.ghost (id int);"
```

## 1. Negative: the 42501 failure must surface actionable guidance

Run the migrator as the master against the pre-created `registry` database. The
`sslmode=require` proves the failure lands **after** a working TLS connection.

```bash
kubectl -n "$NS" apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata: { name: registry-migrator-negative }
spec:
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrator
          image: $MIGRATOR_IMAGE
          imagePullPolicy: Never
          env:
            - { name: DB_HOST,         value: managed-pg }
            - { name: PGUSER,          value: "$MASTER_USER" }
            - { name: PGPASSWORD,      value: "$MASTER_PW" }
            - { name: PGSSLMODE,       value: require }
            - { name: CLIENT_USERNAME, value: client }
            - { name: CLIENT_PASSWORD, value: clientpw }
          volumeMounts:
            - { name: registry-sql, mountPath: /flyway/sql/registry }
      volumes:
        - name: registry-sql
          configMap: { name: registry-sql, items: [{ key: V1__init.sql, path: V1__init.sql }] }
EOF
kubectl -n "$NS" wait --for=condition=Failed job/registry-migrator-negative --timeout=120s
kubectl -n "$NS" logs job/registry-migrator-negative
```

Assert the log shows:

- a working TLS connection: `Database: jdbc:postgresql://managed-pg/registry?sslmode=require (PostgreSQL 17.x)`;
- the real Flyway error `SQL State : 42501` / `permission denied for schema public`; and
- the translated guidance — `SQLSTATE 42501`, `This is NOT a TLS/SSL problem`,
  and `ALTER SCHEMA public OWNER TO "$MASTER_USER"`.

The Job **must** have failed (the error is translated, not swallowed).

## 2. Positive control: grant the privilege → migration succeeds, no guidance

```bash
kubectl -n "$NS" exec managed-pg -- env PGPASSWORD=bootstrap psql -U postgres -d registry \
  -c "ALTER SCHEMA public OWNER TO $MASTER_USER;"

# same Job, different name
kubectl -n "$NS" get job registry-migrator-negative -o json \
  | sed 's/registry-migrator-negative/registry-migrator-positive/' \
  | kubectl -n "$NS" create -f - 2>/dev/null || true
# (or re-apply the Job manifest from step 1 with a new metadata.name)
kubectl -n "$NS" wait --for=condition=Complete job/registry-migrator-positive --timeout=120s
kubectl -n "$NS" logs job/registry-migrator-positive | grep -E "Successfully applied|SQLSTATE 42501"
# expect: "Successfully applied 1 migration ... v1"; NO "SQLSTATE 42501" line
kubectl -n "$NS" exec managed-pg -- env PGPASSWORD=bootstrap psql -U postgres -d registry -tAc "
  SELECT to_regclass('public.e2e_probe') IS NOT NULL, count(*) FROM public.flyway_schema_history;"
# expect: t | 1
```

## 3. Missing database is benign, locale-independently (#3744)

First the two facts the fix relies on — a missing database is empty-without-error
in the catalog, and its connection error carries no parseable SQLSTATE:

```bash
kubectl -n "$NS" exec managed-pg -- env PGPASSWORD=bootstrap psql -U postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='ghostdb'"          # expect: empty, exit 0 (no error)
kubectl -n "$NS" exec managed-pg -- env PGPASSWORD=bootstrap PGSSLMODE=require \
  psql "host=127.0.0.1 dbname=ghostdb user=postgres" -v VERBOSITY=verbose -tAc "select 1"
# expect: FATAL: database "ghostdb" does not exist -- and NO "SQLSTATE" line
```

Then the migrator, as a role that cannot create the database, must take the
benign path rather than aborting:

```bash
kubectl -n "$NS" apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata: { name: migrator-missing-db }
spec:
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrator
          image: $MIGRATOR_IMAGE
          imagePullPolicy: Never
          env:
            - { name: DB_HOST,         value: managed-pg }
            - { name: PGUSER,          value: restricted }   # no CREATEDB -> ghostdb stays missing
            - { name: PGPASSWORD,      value: rpw }
            - { name: PGSSLMODE,       value: require }
            - { name: CLIENT_USERNAME, value: client }
            - { name: CLIENT_PASSWORD, value: clientpw }
          volumeMounts:
            - { name: ghostdb-sql, mountPath: /flyway/sql/ghostdb }
      volumes:
        - name: ghostdb-sql
          configMap: { name: ghostdb-sql, items: [{ key: V1__init.sql, path: V1__init.sql }] }
EOF
kubectl -n "$NS" wait --for=condition=Failed job/migrator-missing-db --timeout=120s
kubectl -n "$NS" logs job/migrator-missing-db
```

Assert the log contains `Database ghostdb does not exist after the create step; skipping legacy Flyway 4 history detection` and does **not** contain
`Aborting: could not determine` — the migrator classified the missing database
as benign via the catalog, then let Flyway be the gate (it then reports
`FATAL: database "ghostdb" does not exist`, which is expected).

## Cleanup

```bash
kubectl delete namespace "$NS" --wait=true --timeout=180s
minikube image rm "$MIGRATOR_IMAGE" 2>/dev/null || true
```

## Notes

- **What is simulated vs. real.** The managed database is a local `postgres:17`
  pod with TLS enforced and a non-superuser master. Flyway, `psql`, the JDBC
  driver and the privilege enforcement are all real — which is the whole point:
  the unit tests shim Flyway/`psql`, so only a real run proves Flyway emits
  `SQL State : 42501` and `psql` reports a missing catalog row without error.
- **Why `sslmode=require`.** It puts a genuine TLS handshake in front of the
  `42501` failure, matching the real-world misdiagnosis this change fixes — the
  error arrives on a fully-established, encrypted connection. `require` does not
  verify the certificate, so no SAN/CA setup is needed; the certificate-
  verification behaviour itself is covered by
  [`db-tls-verify-full.md`](./db-tls-verify-full.md).
- **Relation to `db-tls-verify-full.md`.** That case includes
  `ALTER SCHEMA public OWNER TO <master>` in its `init.sql` precisely so the
  registry migrator can proceed; this case is its negative — omit that line and
  assert the migrator now explains the failure instead of leaving a raw,
  TLS-looking error.
