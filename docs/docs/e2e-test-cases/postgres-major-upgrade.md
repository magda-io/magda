# E2E Test Case: in-cluster PostgreSQL major upgrade (v6 PostgreSQL 13 → v7 PostgreSQL 17)

A step-by-step end-to-end test for the `majorUpgrade` logical dump/restore
mechanism (`major-upgrade-pvc.yaml`, `major-upgrade-dump-job.yaml`,
`major-upgrade-restore-job.yaml` in the
[`magda-postgres`](../../../deploy/helm/internal-charts/magda-postgres) chart), run
against a real cluster (e.g. minikube). It installs a v6 (PostgreSQL 13) release,
seeds verifiable data, upgrades to a v7 (PostgreSQL 17) build with the migration
enabled, and asserts the seeded data survived, the restore is idempotent on a
repeat upgrade, and `helm rollback` returns to a working, intact PostgreSQL 13.
This documents exactly the procedure for gating the v6 → v7 PostgreSQL upgrade —
see the [PostgreSQL major upgrade runbook](../postgres-major-upgrade-runbook.md)
for the operator-facing explanation of what each step does and why.

## What it covers

1. **Install v6, seed data** in both the `registry` and `auth` databases so the
   migration is proven for more than one logical database.
2. **Upgrade to v7 with `majorUpgrade.enabled=true`** and a generous `--timeout`.
3. **Assert the migration ran correctly**: both hook Jobs succeeded in the right
   order, the seeded rows are present in PostgreSQL 17 with the exact counts
   recorded in step 1, `SELECT version()` reports 17.x, the DB migrator Jobs ran
   _after_ the restore without failing on pre-existing schema, the application is
   healthy, the old PostgreSQL 13 StatefulSet/PVC are untouched, and a repeat
   `helm upgrade` with the flag still on is a no-op (idempotency).
4. **Assert rollback**: `helm rollback` brings the PostgreSQL 13 StatefulSet back
   bound to its original PVC, with the seeded rows intact.

## Prerequisites

- A cluster with your `kubectl` context pointed at it (e.g. `minikube start`),
  plus `helm`.
- A published **v6** chart version (default `global.useCombinedDb: true`,
  bundled PostgreSQL 13) and a published **v7** build carrying the
  `majorUpgrade` mechanism (a real release, or a
  [PR preview / branch build](../ci-version-release.md)).
- [`@magda/acs-cmd`](https://www.npmjs.com/package/@magda/acs-cmd) available via
  `yarn acs-cmd` from a magda repo checkout (used to mint an admin session JWT).

```bash
export NS=pg-major-upgrade-e2e
export V6_VERSION=6.2.0            # last PostgreSQL-13 release
export V7_VERSION=7.0.0-pr.3750.1  # branch build carrying majorUpgrade
```

## 1. Install v6 and seed data

```bash
kubectl create namespace "$NS"
helm install magda oci://ghcr.io/magda-io/charts/magda --version "$V6_VERSION" -n "$NS"
kubectl -n "$NS" rollout status statefulset/combined-db-postgresql --timeout=600s
```

Expected: the v6 (PostgreSQL 13) instance, not the renamed one.

```bash
kubectl -n "$NS" get statefulset      # expect combined-db-postgresql (no -pg17)
kubectl -n "$NS" get pvc              # expect data-combined-db-postgresql-0
```

The DB migrator Jobs (`registry-db-migrator`, `authorization-db-migrator`,
`content-db-migrator`, `session-db-migrator`, `tenant-db-migrator` — one per
logical database, all pointed at the combined instance via their client-facing
Service aliases) are `post-install`/`post-upgrade` hooks, so `helm install`
already blocks until they succeed before returning; there is no separate wait
needed. They are also deleted immediately on success
(`hook-delete-policy: hook-succeeded,before-hook-creation`), so don't expect to
find them with `kubectl get jobs` afterwards.

Retrieve the DB password and mint an admin session JWT:

```bash
export PGPASSWORD=$(kubectl get secret -n "$NS" db-main-account-secret -o jsonpath='{.data.postgresql-password}' | base64 -d)
JWT_SECRET=$(kubectl get secret -n "$NS" auth-secrets -o jsonpath='{.data.jwt-secret}' | base64 -d)
yarn --silent acs-cmd jwt 00000000-0000-4000-8000-000000000000 "$JWT_SECRET" | tail -1 > /tmp/admin.jwt
kubectl -n "$NS" port-forward svc/gateway 18080:80 &
```

Seed a **registry** record:

```bash
DATASET_ID="pg-upgrade-e2e-$(date +%s)"
curl -s -X PUT "http://localhost:18080/api/v0/registry/records/$DATASET_ID" \
  -H "X-Magda-Session: $(cat /tmp/admin.jwt)" -H "Content-Type: application/json" -H "X-Magda-Tenant-Id: 0" \
  -d "{\"id\":\"$DATASET_ID\",\"name\":\"PG Upgrade E2E\",\"aspects\":{\"dcat-dataset-strings\":{\"title\":\"PG Upgrade E2E\"},\"publishing\":{\"state\":\"published\"}}}"
```

Seed a local **auth** user:

```bash
curl -s -X POST "http://localhost:18080/api/v0/auth/users" \
  -H "X-Magda-Session: $(cat /tmp/admin.jwt)" -H "Content-Type: application/json" \
  -d '{"displayName":"PG Upgrade E2E User","email":"pg-upgrade-e2e@example.com","source":"e2e-test","sourceId":"pg-upgrade-e2e-1"}'
```

Record exact counts in both databases — these are the numbers step 3 must reproduce:

```bash
kubectl -n "$NS" exec combined-db-postgresql-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -d registry -tAc "SELECT count(*) FROM records;" | tee /tmp/registry-count-v6.txt
kubectl -n "$NS" exec combined-db-postgresql-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -d auth -tAc "SELECT count(*) FROM users;" | tee /tmp/auth-count-v6.txt
```

## 2. Upgrade to the v7 build with the migration enabled

```bash
helm upgrade magda oci://ghcr.io/magda-io/charts/magda --version "$V7_VERSION" -n "$NS" \
  --reuse-values \
  --set combined-db.magda-postgres.majorUpgrade.enabled=true \
  --timeout 3600s
```

`--timeout 3600s` is deliberately generous — Helm's default (5 minutes) is far
too short for a real dump + restore, and it is Helm's own `--timeout`, not
`majorUpgrade.waitTimeoutSeconds`, that bounds this command.

## 3. Assert the migration ran correctly

**a. Both hook Jobs succeeded, in order.**

Both Jobs carry `hook-delete-policy: before-hook-creation,hook-succeeded`, so a
Job that SUCCEEDS is deleted the moment it finishes and `kubectl logs job/...`
will say "not found" once `helm upgrade` returns. (That policy is required for
correctness: these Jobs' pods mount the staging PVC, and a pod that outlives the
release blocks the next upgrade's PVC hook with `pre-upgrade hooks failed: context deadline exceeded`.) A Job that FAILS is not deleted, so failure logs are
always available.

To capture a successful run's logs, start this watcher **before** the
`helm upgrade` in step 2 (it also works for step g below):

```bash
( for i in $(seq 1 3600); do
    for p in $(kubectl -n "$NS" get pods -l job-name -o name 2>/dev/null \
               | grep -E 'major-upgrade-(dump|restore)'); do
      ph=$(kubectl -n "$NS" get "$p" -o jsonpath='{.status.phase}' 2>/dev/null)
      [ "$ph" = "Succeeded" ] || [ "$ph" = "Failed" ] || continue
      f=/tmp/$(basename "$p").log
      [ -s "$f" ] || { echo "--- $p ($ph) ---" > "$f"; kubectl -n "$NS" logs "$p" >> "$f" 2>&1; }
    done
    sleep 1
  done ) &
WATCHER=$!
```

Then read `/tmp/*major-upgrade-dump*.log` and `/tmp/*major-upgrade-restore*.log`.

Expected: the dump log ends with `Dump complete: <size> at /staging/dumpall.sql.gz`;
the restore log ends with `Restore complete: N of N database(s) now present.`
where `N` matches the databases the v6 install created (`registry`, `auth`, plus
any others your topology enables), followed by
`Recording the completed migration in public.magda_major_upgrade ...`.

Remember `kill $WATCHER` at cleanup.

**a2. The durable migration marker exists** — this outlives the Jobs and is what
makes a repeat upgrade a no-op:

```bash
kubectl -n "$NS" exec combined-db-postgresql-pg17-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -d postgres \
  -tAc "SELECT completed_at, databases_restored FROM public.magda_major_upgrade;"
# expect: exactly one row, databases_restored = N from the restore log above
```

**b. The seeded rows are present in PostgreSQL 17 with the recorded counts** —
the actual point of the exercise:

```bash
kubectl -n "$NS" exec combined-db-postgresql-pg17-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -d registry -tAc "SELECT count(*) FROM records;"
# expect: equals the value in /tmp/registry-count-v6.txt
kubectl -n "$NS" exec combined-db-postgresql-pg17-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -d auth -tAc "SELECT count(*) FROM users;"
# expect: equals the value in /tmp/auth-count-v6.txt
kubectl -n "$NS" exec combined-db-postgresql-pg17-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -d registry -tAc "SELECT name FROM records WHERE recordid = '$DATASET_ID';" 2>/dev/null || true
```

**c. The server is really PostgreSQL 17:**

```bash
kubectl -n "$NS" exec combined-db-postgresql-pg17-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -tAc "SELECT version();"
# expect: PostgreSQL 17.5 ...
```

**d. The DB migrator Jobs completed _after_ the restore and did not fail on
pre-existing schema.** The migrator Jobs are `post-upgrade` hooks with
`hook-delete-policy: hook-succeeded,before-hook-creation`, so on success Helm
deletes them as part of processing the upgrade — by the time the `helm upgrade`
command above returns, they are typically already gone, and a successful
`helm upgrade` exit code already means every hook (including them) succeeded
(a failed hook fails the release). Confirm they actually _ran_ — rather than the
restored data merely already matching the target schema — via Flyway's own
history table, which the restore brought over from v6 and the migrator must
have appended to (or found already up to date) without any failed entries:

```bash
kubectl -n "$NS" exec combined-db-postgresql-pg17-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -d registry -c \
  "SELECT installed_rank, version, description, success FROM flyway_schema_history ORDER BY installed_rank;"
```

Expected: the full migration history is present (nothing was lost by the
dump/restore), and every row has `success = t` — in particular there is no row
where a migrator, presented with schema+data restored from v6, tried to
re-create objects that already existed and failed.

**e. Application health:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:18080/api/v0/auth/users/whoami   # 200
curl -s "http://localhost:18080/api/v0/search/datasets?query=PG%20Upgrade%20E2E" \
  -H "X-Magda-Session: $(cat /tmp/admin.jwt)"   # expect the seeded dataset in the results
```

(If search doesn't show the record immediately, allow a few seconds for the
indexer to catch up — it consumes registry events, and the migration doesn't
change that.)

**f. `combined-db-postgresql-pg17` exists; the old instance and PVC are
untouched:**

```bash
kubectl -n "$NS" get statefulset          # expect BOTH combined-db-postgresql and combined-db-postgresql-pg17
kubectl -n "$NS" get pvc                  # expect BOTH data-combined-db-postgresql-0 (old, untouched)
                                           # and data-combined-db-postgresql-pg17-0 (new)
kubectl -n "$NS" exec combined-db-postgresql-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -d registry -tAc "SELECT count(*) FROM records;"
# expect: still equals /tmp/registry-count-v6.txt -- the old PostgreSQL 13 data was never written to
```

**g. Idempotency — re-run `helm upgrade` with the flag still on:**

Delete the captured logs from step (a) first so the watcher refills them, then:

```bash
rm -f /tmp/*major-upgrade-dump*.log /tmp/*major-upgrade-restore*.log
helm upgrade magda oci://ghcr.io/magda-io/charts/magda --version "$V7_VERSION" -n "$NS" \
  --reuse-values \
  --set combined-db.magda-postgres.majorUpgrade.enabled=true \
  --timeout 3600s
cat /tmp/*major-upgrade-dump*.log /tmp/*major-upgrade-restore*.log
```

Expected — **the `helm upgrade` itself must succeed**, which is the point of this
step; a second upgrade used to fail here with
`pre-upgrade hooks failed: context deadline exceeded`:

- the dump Job exits 0 having contacted only the _target_:
  `The target combined-db-postgresql-pg17 carries the public.magda_major_upgrade marker:` / `Nothing to dump.` It must **not** try to reach
  `majorUpgrade.sourceHost` — that Service no longer exists after the first
  upgrade;
- the restore Job exits 0 with
  `The target already holds N database(s); the migration has already run.` /
  `Nothing to do.`;
- nothing is re-dumped or re-restored: the row counts from step (b) are
  unchanged, and `public.magda_major_upgrade` still has exactly one row with the
  original `completed_at`.

Then run it a **third** time and confirm it succeeds too — the failure mode this
guards against only appeared from the second repeat onwards. Also note that the
staging PVC's `uid` changes on each of these upgrades
(`kubectl -n "$NS" get pvc combined-db-postgresql-pg17-major-upgrade -o jsonpath='{.metadata.uid}'`):
that is the delete-and-recreate completing, which is exactly what a leftover hook
pod used to prevent.

## 4. Assert rollback works

```bash
helm rollback magda -n "$NS"
kubectl -n "$NS" rollout status statefulset/combined-db-postgresql --timeout=300s
```

Expected:

```bash
kubectl -n "$NS" get statefulset combined-db-postgresql   # back and Ready
kubectl -n "$NS" get pvc data-combined-db-postgresql-0     # same PVC, bound to the rolled-back StatefulSet
kubectl -n "$NS" exec combined-db-postgresql-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -d registry -tAc "SELECT count(*) FROM records;"
# expect: still equals /tmp/registry-count-v6.txt -- rollback did not lose data
kubectl -n "$NS" exec combined-db-postgresql-0 -- env PGPASSWORD="$PGPASSWORD" \
  psql -U postgres -h 127.0.0.1 -d auth -tAc "SELECT count(*) FROM users;"
# expect: still equals /tmp/auth-count-v6.txt
```

## Cleanup

```bash
kill %1 2>/dev/null   # the port-forward started in step 1
kill $WATCHER 2>/dev/null   # the hook-Job log watcher started in step 3a
helm uninstall magda -n "$NS"
kubectl delete namespace "$NS" --wait=true --timeout=180s
rm -f /tmp/admin.jwt /tmp/registry-count-v6.txt /tmp/auth-count-v6.txt
rm -f /tmp/*major-upgrade-dump*.log /tmp/*major-upgrade-restore*.log
```

## Notes

- Run this whenever the `majorUpgrade` mechanism (the dump/restore Jobs, the
  staging PVC, or the values contract) changes, and once per release cycle that
  bumps the bundled PostgreSQL major version.
- This case exercises the **combined-db** topology
  (`global.useCombinedDb: true`). If your deployment uses per-service instances
  (`global.useInK8sDbInstance.<db>: true`), repeat steps 2–4 with
  `majorUpgrade.enabled=true` set on each `*-db` chart individually (see
  [Per-service instances](../postgres-major-upgrade-runbook.md#9-per-service-instances)
  in the runbook) and expect `N` databases across `N` separate hook Job pairs
  rather than a single combined instance.
- On Apple-Silicon minikube the amd64 `magda-postgres` image runs under
  rosetta/qemu, so pod startup and the dump/restore itself are slower than on a
  native amd64 node — size `--timeout` and the rollout timeouts above with that
  in mind.
- See also [PostgreSQL major upgrade runbook](../postgres-major-upgrade-runbook.md)
  for what each step means operationally, and
  [In-cluster PostgreSQL wal-g cross-version backup / restore](./postgres-walg-cross-version-restore.md)
  for the (unrelated) wal-g backup/restore version-compatibility case.
