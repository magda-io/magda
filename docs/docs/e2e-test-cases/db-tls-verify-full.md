# E2E Test Case: `sslmode=verify-full` server-certificate verification against a simulated managed database

A step-by-step end-to-end test that `global.postgresql.client.sslmode: verify-full`
genuinely verifies a PostgreSQL server's certificate — chain **and** hostname —
when Magda is deployed against an external database, run against a real cluster
(e.g. minikube).

Because a CI cluster has no real RDS/Azure/Cloud SQL instance, the managed
database is **simulated in-cluster** with a stock `postgres:17` pod configured
to enforce TLS (`hostssl`-only `pg_hba.conf`), exactly as
[DB TLS + non-default privileged user](./db-tls-and-privileged-user.md)'s case
C5 and
[Migrate the in-cluster PostgreSQL to a managed/cloud database](./postgres-in-cluster-to-managed-db-migration.md)
do. This case goes one step further than both: those exercise `sslmode=require`
(encrypted, but the server certificate is never checked), while this one turns
on `verify-full` and proves Magda actually validates the certificate against a
trusted CA **and** rejects a hostname mismatch — the two failure modes
`require` cannot catch.

This complements
[`magda-int-test-ts/src/tests/dbClientCaVerification.spec.ts`](https://github.com/magda-io/magda/blob/main/magda-int-test-ts/src/tests/dbClientCaVerification.spec.ts),
which already proves — automatically, in CI, on every build — that
`getPgSslConfigFromEnv` (the function every Node service and DB migrator uses)
causes a real `pg` client and a real `psql` client to verify a real TLS
certificate correctly, including rejecting an unrelated CA. What that spec
cannot reach is the **cluster** level: a real Helm install, the CA `Secret`
delivered to the DB-connecting workloads through the chart, and the chart's
render-time guard that refuses to let an operator configure `verify-full`
without a CA at all. This case covers that gap.

On the default render this case builds (`useAwsRdsDb=true`, single-tenant),
the CA `Secret` is mounted into **9** workloads: the 4 Node services that talk
to Postgres directly (`authorization-api`, `content-api`, `gateway`,
`registry-api`), the 4 DB migrator Jobs (`authorization-db`, `content-db`,
`registry-db`, `session-db`), and the `registry-db` auto-vacuum CronJob. With
`global.enableMultiTenants=true`, `tenant-api` and its migrator Job also mount
it, and enabling `registry-api`'s read-only Deployment
(`registry-api.deployments.readOnly.enable`) adds one more — neither is part
of this case's default install.

## The one thing to get right: the certificate's SAN

Read this before generating any certificate — it is the most common way this
test goes wrong.

Every Magda component connects to its logical database through a **fixed,
chart-hardcoded Kubernetes Service name**: `registry-api` and the
`registry-db-migrator` Job dial `registry-db`, `authorization-api` and its
migrator dial `authorization-db`, `content-api` and its migrator dial
`content-db`, and `gateway` (which owns the session store) and the
`session-db-migrator` dial `session-db` (add `tenant-db` if
`global.enableMultiTenants=true`). This is true regardless of whether the
database behind that name is the in-cluster PostgreSQL or an external one: when
`global.useAwsRdsDb` is enabled, the chart turns each of those Services into a
type-`ExternalName` alias whose target is `global.awsRdsEndpoint` — but the
_string every client hands to libpq/pgjdbc for the TLS handshake_ is still the
short Service name (`registry-db`, and so on), not the external endpoint's own
hostname.

`verify-full` checks the certificate's Subject Alternative Names against
exactly that string. So the simulated managed database's certificate must
carry **`registry-db`, `authorization-db`, `content-db` and `session-db`** in
its SAN — not the pod's own name, and not the "real" endpoint name a managed
provider would use. Missing one of them fails only _that_ component with a
hostname/`ALTNAME` mismatch while the others succeed, which is a confusing
partial failure if you haven't seen this before.

## What it covers

1. **Deploy a simulated managed database** — TLS-enforced, non-superuser
   master, with a certificate whose SAN covers every internal Service name
   Magda will dial.
2. **Create the CA secret** the chart will mount.
3. **Install Magda against it** with `sslmode: verify-full`, and confirm the
   install actually **fails at render time** if the CA secret is left unset —
   this is deliberate chart behaviour, not a bug.
4. **Assert** every DB migrator Job completes, every service comes up, and the
   application serves a seeded dataset — all over a verified TLS connection.
5. **Negative case** — point the same install at a CA that does **not** match
   the server's certificate and confirm the migrators fail with a
   certificate-verification error, not a silent fallback to unverified TLS.

## Prerequisites

- A cluster with your `kubectl` context pointed at it (e.g. `minikube start`),
  plus `helm` and `openssl`.
- A published Magda chart version (`oci://ghcr.io/magda-io/charts/magda`).
- [`@magda/acs-cmd`](https://www.npmjs.com/package/@magda/acs-cmd) available via
  `yarn acs-cmd` from a magda repo checkout (used in step 4 to mint an admin
  session JWT).

```bash
export NS=db-verify-full-e2e
export MASTER_USER=magda_admin
export MASTER_PW=dstpass
kubectl create namespace "$NS"
```

## 0. Deploy the simulated managed database

Generate a CA-equivalent self-signed server certificate whose SAN covers all
four internal Service names, plus the pod's own Service name (`managed-pg`,
useful for the direct sanity checks below), and load it — along with the
TLS-enforcing `pg_hba.conf` and a non-superuser master role — into the
namespace:

```bash
cd $(mktemp -d)
openssl req -new -x509 -days 365 -nodes -text -out server.crt -keyout server.key \
  -subj "/CN=managed-pg" \
  -addext "subjectAltName=DNS:managed-pg,DNS:registry-db,DNS:authorization-db,DNS:content-db,DNS:session-db"
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
-- the in-cluster chart grants this to its privileged user at first boot
-- (magda-postgres's initdb hook); for an external DB the operator normally
-- does this once via the provider's admin account -- here, this init.sql
-- stands in for that step. Required for the registry-db migrator's
-- `CREATE EXTENSION "uuid-ossp"` (trusted, but needs CREATE on the database).
GRANT ALL PRIVILEGES ON DATABASE postgres TO $MASTER_USER;
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

Confirm the certificate actually carries all four names before going further —
this catches a typo now instead of a confusing partial failure later:

```bash
kubectl -n "$NS" exec managed-pg -- openssl x509 -in /certs/server.crt -noout -text \
  | grep -A1 "Subject Alternative Name"
# expect: DNS:managed-pg, DNS:registry-db, DNS:authorization-db, DNS:content-db, DNS:session-db
```

Also create the master account secret **before** installing. Helm auto-creates
`db-main-account-secret` if it's missing — that auto-create is not gated on
`useAwsRdsDb`/`useCloudSql` at all, it just fills the `postgresql-password` key
with a random value when nothing already exists. For the in-cluster database
that's fine, because the same install also creates the account with that
password; for an external database it is not, because the account already
exists on the far end with a password Helm doesn't know. If you skip this
step, the migrator Jobs won't fail with an obvious "missing secret" error —
they'll fail with a password-authentication error, because Helm generated a
password that doesn't match `$MASTER_PW`:

```bash
kubectl -n "$NS" create secret generic db-main-account-secret \
  --from-literal=postgresql-password="$MASTER_PW"
```

## 1. Create the CA secret

```bash
kubectl -n "$NS" create secret generic pg-ca --from-file=ca.crt=server.crt
```

`ca.crt` matches `global.postgresql.client.sslRootCertSecret.key`'s default, so
the values below don't need to override it. The chart remaps whatever key you
use to the fixed file name `root.crt` when it mounts the secret — regardless
of the key name in the `Secret`, every container that needs the CA sees it at
the same path, `/etc/magda/postgresql-ca/root.crt` (volume name
`postgresql-ca`).

## 2. Confirm the render-time guard (no CA secret configured)

Before installing, confirm the chart actually refuses to render `verify-full`
without a CA secret — there is deliberately **no** trust-store fallback, even
for a publicly-trusted root CA such as Azure's DigiCert Global Root G2, because
Magda's DB migrator image ships libpq older than 16, which has no
`sslrootcert=system` support:

```bash
helm template magda oci://ghcr.io/magda-io/charts/magda -n "$NS" \
  --set global.useCombinedDb=false \
  --set global.useAwsRdsDb=true \
  --set global.awsRdsEndpoint="managed-pg.$NS.svc.cluster.local" \
  --set global.postgresql.auth.username="$MASTER_USER" \
  --set global.postgresql.client.sslmode=verify-full
# expect: Error: execution error ... requires a server CA certificate: set
# global.postgresql.client.sslRootCertSecret.name ...
```

## 3. Install Magda with `sslmode: verify-full`

```bash
helm install magda oci://ghcr.io/magda-io/charts/magda -n "$NS" \
  --set global.useCombinedDb=false \
  --set global.useAwsRdsDb=true \
  --set global.awsRdsEndpoint="managed-pg.$NS.svc.cluster.local" \
  --set global.postgresql.auth.username="$MASTER_USER" \
  --set global.postgresql.client.sslmode=verify-full \
  --set global.postgresql.client.sslRootCertSecret.name=pg-ca \
  --wait --timeout 3600s
```

Equivalently, as a values file:

```yaml
global:
  useCombinedDb: false
  useAwsRdsDb: true
  awsRdsEndpoint: managed-pg.db-verify-full-e2e.svc.cluster.local
  postgresql:
    auth:
      username: magda_admin
    client:
      sslmode: verify-full
      sslRootCertSecret:
        name: pg-ca
        key: ca.crt # the default; shown here for clarity
```

The install must **succeed**: the `registry-db-migrator`,
`authorization-db-migrator`, `content-db-migrator` and `session-db-migrator`
post-install Jobs all connect to `managed-pg` over TLS, verifying its
certificate against `pg-ca`, before the hook is considered done. Node
services read the CA via the `PGSSLROOTCERT` environment variable;
**`registry-api` reads it differently** — pgjdbc ignores `PG*` environment
variables entirely, so the chart instead bakes the CA path into its JDBC URL
as an `sslrootcert=` parameter. The DB migrator Jobs need **both** forms at
once, because `migrate.sh` runs plain `psql` (which honours `PGSSLROOTCERT`)
and also drives Flyway over pgjdbc (which needs the JDBC parameter,
which `migrate.sh` appends itself from the same environment variables).

## 4. Assert verified TLS end-to-end

```bash
kubectl get pods -n "$NS" --no-headers | grep -vE "Running|Completed"   # expect empty
kubectl get jobs -n "$NS"
# expect: registry-db-migrator, authorization-db-migrator, content-db-migrator,
#         session-db-migrator all show COMPLETIONS 1/1
```

Confirm the server side agrees the connections were encrypted (this does not
by itself prove hostname verification — a hostname mismatch would have failed
the migrator Jobs above outright, which is the real proof `verify-full` ran):

```bash
kubectl -n "$NS" exec managed-pg -- env PGPASSWORD=bootstrap psql -U postgres -tAc "
  SELECT a.usename, s.ssl, s.version
  FROM pg_stat_ssl s JOIN pg_stat_activity a USING (pid)
  WHERE a.usename IS NOT NULL ORDER BY 1;"
# expect: ssl = t for every row (magda_admin and client connections)
```

Then confirm the application is actually functional through the gateway, not
just that the migrators completed — seed a dataset and read it back (see
[Feature-specific testing through the gateway with an API key](../e2e-cluster-deployment-test.md#feature-specific-testing-through-the-gateway-with-an-api-key)
for background on the admin-session approach used below):

```bash
kubectl -n "$NS" port-forward svc/gateway 18080:80 & sleep 6
JWT_SECRET=$(kubectl get secret -n "$NS" auth-secrets -o jsonpath='{.data.jwt-secret}' | base64 -d)
yarn --silent acs-cmd jwt 00000000-0000-4000-8000-000000000000 "$JWT_SECRET" | tail -1 > /tmp/admin.jwt
DATASET_ID="verify-full-e2e-$(date +%s)"
curl -s -X PUT "http://localhost:18080/api/v0/registry/records/$DATASET_ID" \
  -H "X-Magda-Session: $(cat /tmp/admin.jwt)" -H "Content-Type: application/json" -H "X-Magda-Tenant-Id: 0" \
  -d "{\"id\":\"$DATASET_ID\",\"name\":\"verify-full e2e\",\"aspects\":{}}"
curl -s "http://localhost:18080/api/v0/registry/records/$DATASET_ID" -H "X-Magda-Tenant-Id: 0"
# expect: the record just PUT, served through registry-api's own verify-full connection
kill %1 2>/dev/null   # the gateway port-forward
```

## 5. Negative case: a CA that doesn't match must fail

A test that only covers the happy path can't tell "verification is working"
apart from "verification is silently disabled". Install a **second** release
into a fresh namespace, pointed at the same simulated managed database, but
with a CA `Secret` that does not chain to `managed-pg`'s actual certificate:

```bash
export NEG_NS=db-verify-full-e2e-neg
kubectl create namespace "$NEG_NS"

cd $(mktemp -d)
openssl req -new -x509 -days 365 -nodes -out wrong.crt -keyout wrong.key \
  -subj "/CN=unrelated-ca"
kubectl -n "$NEG_NS" create secret generic pg-ca-wrong --from-file=ca.crt=wrong.crt
kubectl -n "$NEG_NS" create secret generic db-main-account-secret \
  --from-literal=postgresql-password="$MASTER_PW"

helm install magda oci://ghcr.io/magda-io/charts/magda -n "$NEG_NS" \
  --set global.useCombinedDb=false \
  --set global.useAwsRdsDb=true \
  --set global.awsRdsEndpoint="managed-pg.$NS.svc.cluster.local" \
  --set global.postgresql.auth.username="$MASTER_USER" \
  --set global.postgresql.client.sslmode=verify-full \
  --set global.postgresql.client.sslRootCertSecret.name=pg-ca-wrong \
  --wait --timeout 600s
# expect: the install FAILS -- the post-install migrator hooks time out / error
```

Confirm it failed for the **right** reason — a certificate-verification error,
not connectivity or a typo:

```bash
kubectl -n "$NEG_NS" logs job/registry-db-migrator | tail -30
# expect: an SSL/certificate error (e.g. "SSL error: certificate verify failed"
# or "self-signed certificate"), NOT a connection-refused / timeout message
```

Clean up the negative-case namespace once you've confirmed the failure:

```bash
helm uninstall magda -n "$NEG_NS" 2>/dev/null || true
kubectl delete namespace "$NEG_NS" --wait=true --timeout=180s
```

## Cleanup

```bash
helm uninstall magda -n "$NS"
kubectl delete namespace "$NS" --wait=true --timeout=300s
rm -f /tmp/admin.jwt
```

## Notes

- **What is simulated vs. real.** The managed database is a local `postgres:17`
  pod with TLS enforced, a non-superuser master, and a certificate whose SAN is
  built specifically to match Magda's internal Service names. A real managed
  provider's certificate covers its own endpoint name, not `registry-db` /
  `authorization-db` / `content-db` / `session-db` — this case validates that
  Magda's `verify-full` wiring genuinely performs chain-and-hostname
  verification against _whatever_ SAN a certificate has, not that any specific
  provider's certificate happens to already match Magda's internal naming.
- **Why the SAN list looks unusual.** This is the one detail every future
  reader of this case is most likely to get wrong: the certificate must name
  the _Service_ Magda dials (`registry-db`, etc.), never the pod or the
  provider's real endpoint name. See "The one thing to get right" above.
- **Major-upgrade dump/restore Jobs are out of scope here.** The
  `magda-postgres` chart's `majorUpgrade` dump/restore Jobs only ever run
  against the in-cluster PostgreSQL during a PG13→17 upgrade; they are not
  applicable to (and do not mount) the external-DB CA, so this case has
  nothing to say about them.
- See also
  [DB TLS + non-default privileged user](./db-tls-and-privileged-user.md)
  (case C5, the `sslmode=require` version of this same simulated-external-DB
  setup) and
  [Migrate the in-cluster PostgreSQL to a managed/cloud database](./postgres-in-cluster-to-managed-db-migration.md)
  (which reuses the same TLS-enforcing pod pattern for a real Pathway B
  migration, also at `sslmode=require`).
