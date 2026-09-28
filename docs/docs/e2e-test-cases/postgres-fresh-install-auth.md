# E2E Test Case: fresh install on PostgreSQL 17 — client authentication

A short end-to-end test that a **fresh** Magda install can actually authenticate to the
bundled PostgreSQL 17 instance, from every kind of client in the stack: the Scala
registry API (JDBC), the Node services (`pg`), and the Flyway DB migrators.

Run it whenever the bundled PostgreSQL major version changes, or when any JDBC driver,
`pg` version, or the `magda-db-migrator` image is bumped.

## Why this is a separate case from the upgrade one

PostgreSQL 14 changed the default `password_encryption` from `md5` to `scram-sha-256`,
and PostgreSQL 17 keeps it. So a **fresh** install stores SCRAM verifiers, and every
client must be able to speak SASL/SCRAM.

A **migrated** install does not, and that is the trap: `pg_dumpall` carries the previous
major's role definitions across verbatim, including their **md5** password verifiers, so
a migrated PostgreSQL 17 keeps working with clients that cannot do SCRAM — until someone
rotates a password.

The two paths therefore fail differently, and the
[major upgrade case](./postgres-major-upgrade.md) **cannot** catch this class of bug:
it starts from a v6 instance and inherits md5. This has already happened once —
`magda-registry-api` shipped a 2016 JDBC driver that predates SCRAM support, and the
failure was only visible on a fresh install (see #3749).

Symptoms to recognise:

| Message                                            | Meaning                                                                                                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `The authentication type 10 is not supported`      | A JDBC client too old for SCRAM. Type 10 is SASL.                                                                                                                                                            |
| `password authentication failed for user "<role>"` | Either a genuinely wrong password **or a role that does not exist** — PostgreSQL deliberately returns the same message for both, so a failed migrator that never created the role looks like a bad password. |

## Prerequisites

- A cluster with your `kubectl` context pointed at it (e.g. `minikube start`), plus `helm`.
- A published v7 build (a real release, or a [PR preview / branch build](../ci-version-release.md)).

```bash
export NS=pg-fresh-auth-e2e
export V7_VERSION=7.0.0-pr.3762.3
```

## 1. Fresh install

```bash
kubectl create namespace "$NS"
helm install magda oci://ghcr.io/magda-io/charts/magda --version "$V7_VERSION" -n "$NS" \
  --wait --timeout 3600s
```

Use a generous `--timeout`: the DB migrators are `post-install` hooks that run in
sequence, and Helm's 5-minute default is not enough — a timeout here reports
`context canceled` and leaves databases **missing**, which reads like a partially
working install rather than a timeout.

## 2. Confirm the server really is storing SCRAM verifiers

If this shows `md5`, the rest of the test proves nothing — you are not exercising the
path that matters.

```bash
export PGPASSWORD=$(kubectl get secret -n "$NS" db-main-account-secret -o jsonpath='{.data.postgresql-password}' | base64 -d)
kubectl -n "$NS" exec combined-db-postgresql-pg17-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -tAc \
  "SELECT rolname, CASE WHEN rolpassword LIKE 'SCRAM%' THEN 'SCRAM' WHEN rolpassword LIKE 'md5%' THEN 'md5' ELSE 'other' END
     FROM pg_authid WHERE rolname IN ('postgres','client') ORDER BY rolname"
```

Expected: both roles report **`SCRAM`**.

## 3. The Flyway migrators authenticated

The migrators create the `client` role. If they could not connect, the role does not
exist and every service fails later with a message that looks unrelated.

```bash
kubectl -n "$NS" exec combined-db-postgresql-pg17-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -tAc "SELECT count(*) FROM pg_roles WHERE rolname='client'"

kubectl -n "$NS" exec combined-db-postgresql-pg17-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -d postgres -tAc "SELECT count(*) FROM schema_version"
```

Expected: `1` for the role, and a non-zero migration count. Repeat the second query for
`-d auth`, `-d content` and `-d session`.

> The migrator image is pulled by tag, so it can lag the chart. If these fail with
> `The authentication type 10 is not supported`, the image is older than the chart —
> check which `magda-db-migrator` tag is in use rather than suspecting the database.

## 4. The Scala registry API authenticated (JDBC)

This is the client that broke last time, and it is the only Scala/JDBC consumer.

```bash
kubectl -n "$NS" logs deploy/registry-api-full --tail=50 | grep -iE "authentication|PSQLException" || echo "no auth errors"
kubectl -n "$NS" get pods -l component=registry-api
```

Expected: no `PSQLException`, no `authentication type 10`, pod `Running` and ready.

Then prove it is actually serving from the database, not merely up:

```bash
kubectl -n "$NS" port-forward svc/gateway 18080:80 &
curl -s "http://localhost:18080/api/v0/registry/records?limit=1" -H "X-Magda-Tenant-Id: 0" | head -c 200
```

Expected: a JSON response, not a 500.

## 5. The Node services authenticated (`pg`)

```bash
for d in authorization-api content-api session-db-migrator; do
  kubectl -n "$NS" logs "deploy/$d" --tail=30 2>/dev/null | grep -iE "password authentication failed|SASL|ECONNREFUSED" \
    && echo "  ^ $d has DB auth errors" || echo "$d: clean"
done
```

Expected: clean for each. A `password authentication failed for user "client"` here
usually means step 3 failed, not that this service is misconfigured.

## 6. End-to-end write

Proves the whole chain — service → `client` role → PostgreSQL 17 — not just startup.

```bash
JWT_SECRET=$(kubectl get secret -n "$NS" auth-secrets -o jsonpath='{.data.jwt-secret}' | base64 -d)
yarn --silent acs-cmd jwt 00000000-0000-4000-8000-000000000000 "$JWT_SECRET" | tail -1 > /tmp/admin.jwt

ID="fresh-auth-e2e-$(date +%s)"
curl -s -X PUT "http://localhost:18080/api/v0/registry/records/$ID" \
  -H "X-Magda-Session: $(cat /tmp/admin.jwt)" -H "Content-Type: application/json" -H "X-Magda-Tenant-Id: 0" \
  -d "{\"id\":\"$ID\",\"name\":\"Fresh Auth E2E\",\"aspects\":{\"dcat-dataset-strings\":{\"title\":\"Fresh Auth E2E\"}}}"

kubectl -n "$NS" exec combined-db-postgresql-pg17-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -d postgres -tAc "SELECT recordid FROM records WHERE recordid='$ID'"
```

Expected: the record id comes back from the database.

> Note the `-d postgres`. In the default (`useCombinedDb: true`) topology there is no
> database named `registry` — `registry-api` connects with no `POSTGRES_DB` set, so the
> registry's tables live in the connecting role's default database.

## 7. Clean up

```bash
kill %1 2>/dev/null   # the port-forward
helm uninstall magda -n "$NS"
kubectl delete namespace "$NS"
```

## Related

- [In-cluster PostgreSQL major upgrade](./postgres-major-upgrade.md) — the migrated path, which inherits md5 verifiers and cannot exercise this.
- [DB TLS + non-default privileged user](./db-tls-and-privileged-user.md)
- [End-to-End Full Cluster Deployment Test](../e2e-cluster-deployment-test.md)
