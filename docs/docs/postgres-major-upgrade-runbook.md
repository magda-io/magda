# Runbook: PostgreSQL Major Upgrade (in-cluster, v6 → v7 / PostgreSQL 13 → 17)

## 1. What this is for

Magda v7 upgrades the **bundled, in-cluster** PostgreSQL from 13.7 to 17.5 (the
[`magda-postgres`](../../deploy/helm/internal-charts/magda-postgres) chart's
`postgresql` subchart). This runbook covers moving your **existing v6 data** into
the new PostgreSQL 17 instance as part of a v6 → v7 `helm upgrade`.

It applies only to the in-cluster option — every database chart
(`combined-db`, `registry-db`, `authorization-db`, `content-db`, `session-db`,
`tenant-db`) that embeds `magda-postgres` and runs its own PostgreSQL pod. If you
use a managed/external database (AWS RDS, Azure Database for PostgreSQL, GCP Cloud
SQL, or any `global.useCloudSql`/externally-hosted setup), the version, and any
major-version upgrade of it, is owned by your provider; this document and the
`majorUpgrade.*` values do not apply and have no effect.

## 2. Why an in-place upgrade is impossible

Two independent things make a plain `helm upgrade` unable to carry PostgreSQL 13
data into PostgreSQL 17 in place:

- **The data files are not compatible across the major version.** PostgreSQL does
  not guarantee on-disk format compatibility across major versions, and a
  PostgreSQL 17 server cannot start against a PostgreSQL 13 data directory.
- **The new pod labels are immutable.** The postgresql subchart used for
  PostgreSQL 17 adds `app.kubernetes.io/component: primary` to the pod template
  labels, and those labels land in the StatefulSet's `spec.selector`, which
  Kubernetes treats as immutable after creation. There is no label change that
  can be rolled onto an existing StatefulSet.

Because of the second point, the chart does not try to reuse the old StatefulSet
at all — the PostgreSQL 17 instance is a **new** object, named
`<db>-postgresql-pg17` (e.g. `combined-db-postgresql-pg17`), with its own new data
PVC (`data-<db>-postgresql-pg17-0`).

**If you run a plain `helm upgrade` to v7 without anything described in this
runbook, you get a new, empty database.** Nothing dumps or restores your v6 data
automatically. The old PostgreSQL 13 StatefulSet and its data PVC
(`data-<db>-postgresql-0`) are simply left in place, untouched, alongside the new,
empty one.

## 3. The wal-g caveat — backups do not cross majors

The in-cluster wal-g backup/restore mechanism (see
[In-cluster Database Backup & Restore](./in-cluster-database-backup-and-restore.md))
is **not** a major-upgrade path:

- `wal-g backup-fetch` restores a **physical** copy of the data directory. A
  base backup taken from a PostgreSQL 13 server can only ever be restored into a
  PostgreSQL 13 server — the files are not readable by PostgreSQL 17.
- The wal-g backup chain you accumulated on v6 is **rollback-to-13 material
  only**. It lets you recover a PostgreSQL 13 instance if something goes wrong
  before or during the cutover; it is not a way to load data into PostgreSQL 17,
  and it is not a way to load data into a managed/external database either.
- Once you've cut over to PostgreSQL 17, **take a fresh base backup**. The v6
  chain does not, and cannot, continue against the new instance — continuous
  archiving on the new instance starts from nothing until a new base backup
  exists.

The mechanism this runbook describes instead performs a **logical** dump
(`pg_dumpall`) of the running PostgreSQL 13 server over the network and loads it
into the new PostgreSQL 17 server with `psql` — a supported cross-major path,
immune to the on-disk format change.

## 4. Prerequisites

- **`global.postgresql.auth.username` must be `postgres`.** The restore Job
  connects as the privileged user named by this value and fails fast, with an
  explicit error, if it is anything else. `pg_dumpall --clean --if-exists` always
  emits `DROP ROLE IF EXISTS postgres;` for the bootstrap superuser, and the
  restore's role-filtering step only special-cases that literal `postgres` name —
  it does not attempt to reproduce PostgreSQL's identifier-quoting rules for an
  arbitrary custom username. If you use a non-default privileged username, switch
  it to `postgres` for the duration of the migration (this is also the default).
- **Check the staging volume size against your real database size** before
  starting:
  ```sql
  SELECT pg_size_pretty(sum(pg_database_size(datname))) FROM pg_database;
  ```
  The staging PVC holds a **gzip-compressed** `pg_dumpall` output (no indexes, no
  bloat — typically much smaller than the on-disk data directory), sized by
  `majorUpgrade.stagingVolumeSize` (default `20Gi`). Running out of space
  mid-dump fails the upgrade; size it with headroom. Override with
  `stagingStorageClass` if you need a specific storage class (default: cluster
  default class).
- **Expect downtime for the duration of the dump plus the restore.** The dump
  reads the whole v6 database over the network; the restore loads it back
  through `psql` before the DB migrators run. Application pods that depend on
  the database will not have a usable schema until the restore Job completes.
- **A `Pending` staging PVC under a `WaitForFirstConsumer` storage class does not
  stall the upgrade.** Helm's hook waiter only blocks on `Job`/`Pod` kinds, not
  on `PersistentVolumeClaim`; the PVC binds once the dump Job's pod is scheduled.
  You do not need a storage class with `Immediate` binding for this to work.

## 5. The upgrade

1. On **every** in-cluster database chart that currently holds data (i.e. every
   chart where `global.useCombinedDb` or `global.useInK8sDbInstance.<db>` is
   `true`), set:

   ```yaml
   <db>:
     magda-postgres:
       majorUpgrade:
         enabled: true
   ```

   e.g. for a combined database:

   ```yaml
   combined-db:
     magda-postgres:
       majorUpgrade:
         enabled: true
   ```

   Also set `majorUpgrade.sourceHost` if you customised
   `postgresql.fullnameOverride` on the v6 instance — each wrapper chart ships a
   default (e.g. `combined-db-postgresql`, `registry-db-postgresql`) matching the
   **un-suffixed** v6 name. `sourceHost` must name the OLD (PostgreSQL 13)
   instance's Service; after the upgrade completes there is no Service by that
   name any more, so a stale or wrong value fails the dump Job rather than
   silently succeeding against the wrong server.

   **The dump Job has a version safety net for a mis-pointed `sourceHost`.**
   Before it dumps anything it asks the source for `server_version_num` and:

   - **Refuses to dump from a PostgreSQL 17 (or later) source.** The dangerous
     case is `sourceHost` pointing at the _new_ PG17 instance — that is a
     reachable server which would yield a perfectly valid, non-empty dump of an
     empty database, and the upgrade would go green over an empty PostgreSQL 17.
     The Job aborts instead, with a message naming `majorUpgrade.sourceHost`.
   - **Refuses to proceed if the source's version cannot be determined at all.**
     If the query returns anything that is not an integer, the Job aborts rather
     than assuming the source is fine. It will not dump from a server whose
     version it could not verify.

   Both abort in the `pre-upgrade` hook phase, before Helm has touched any
   resource, so nothing has been changed when you see the error.

2. Run `helm upgrade` with an **explicit, generous `--timeout`**:

   ```bash
   helm upgrade magda <chart> -n <namespace> \
     --set magda-core.combined-db.magda-postgres.majorUpgrade.enabled=true \
     --timeout 3600s
   ```

   **Do not pass `--reuse-values`.** It uses the previous release's _computed_
   values as the base, so this chart's new defaults never apply — and v7 deliberately
   restructured the PostgreSQL values contract (`auth.*`, `primary.*`, TLS). The reused
   v6 `tls` shape leaves the new instance's TLS listener off while clients still resolve
   `sslmode: require`, and the `validate-tls` guard aborts the upgrade before any hook
   runs. Re-supply your own values explicitly with `-f` instead.

   **Get the value path right — a wrong one fails silently.** Helm accepts any
   `--set` path, known or not, so a mistyped or mis-nested path sets a value nothing
   reads: the migration is skipped, the PostgreSQL 17 instance comes up empty, and
   the upgrade reports success. The prefix depends on which chart you install:

   | Installing                                    | Path                                                  |
   | --------------------------------------------- | ----------------------------------------------------- |
   | `magda` (the umbrella chart — the usual case) | `magda-core.<db>.magda-postgres.majorUpgrade.enabled` |
   | `magda-core` directly                         | `<db>.magda-postgres.majorUpgrade.enabled`            |

   Confirm before you rely on it, rather than trusting the flag was accepted:

   ```bash
   helm template magda <chart> \
     --set magda-core.combined-db.magda-postgres.majorUpgrade.enabled=true \
     | grep -c major-upgrade      # expect a non-zero count, not 0
   ```

   **Helm's `--timeout` is what aborts a long migration, not
   `majorUpgrade.waitTimeoutSeconds`.** `waitTimeoutSeconds` only bounds how long
   each hook Job waits for its PostgreSQL server to start accepting connections
   (default 900s) — it does not bound the dump or restore itself. Helm's own
   `--timeout` defaults to 5 minutes, which a real dump-plus-restore will exceed.
   If Helm's timeout fires first, Helm reports the upgrade as failed while the
   restore Job keeps running in the cluster underneath it — size `--timeout`
   comfortably larger than your expected dump-plus-restore duration (informed by
   the database size you checked in the prerequisites). **Whatever the restore
   Job's pod ends up doing (still running, succeeded, or failed), it still mounts
   the staging PVC and so still pins it** — do not just re-run `helm upgrade`; see
   [§8, "A leftover hook Job blocks the next upgrade"](#a-leftover-hook-job-blocks-the-next-upgrade)
   for why that hangs the retry and what to delete first.

## 6. Verifying

After the upgrade command returns successfully:

1. **Read both hook Jobs' logs.** The dump log reports the compressed dump size;
   the restore log reports `Restore complete: N of N database(s) now present.`,
   followed by a second line for the `postgres` database's own content --
   `postgres database content check: N of N expected public-schema table(s) present.` (or, if the dump's `postgres` section defined no public-schema
   tables at all, a line saying the check was skipped rather than silently
   omitted). See the note on the `postgres` database in step 3 below for why
   this second check exists.

   Both Jobs carry `hook-delete-policy: before-hook-creation,hook-succeeded`, so
   **a Job that SUCCEEDS is deleted as soon as it finishes** and
   `kubectl logs job/...` will report "not found" after the upgrade returns.
   (This is not cosmetic — those Jobs' pods mount the staging PVC, and a pod that
   outlives the release blocks the next upgrade; see §8.) To read a successful
   run's logs, follow them while the upgrade is still in flight:

   ```bash
   kubectl logs -f -l job-name=<db>-postgresql-pg17-major-upgrade-dump
   kubectl logs -f -l job-name=<db>-postgresql-pg17-major-upgrade-restore
   ```

   A Job that **fails** is _not_ deleted, so its logs are always there when you
   actually need them. And the durable record of a successful migration is the
   marker table in step 2 below, which outlives the Jobs entirely.

2. **Check the migration marker on the new instance.** The restore Job writes one
   row into `public.magda_major_upgrade` in the new instance's `postgres`
   database, _after_ its own post-restore verification passed:
   ```bash
   kubectl exec <db>-postgresql-pg17-0 -- env PGPASSWORD=<password> \
     psql -U postgres -d postgres \
     -c 'SELECT completed_at, databases_restored, server_version FROM public.magda_major_upgrade'
   ```
   `databases_restored` must match the number of databases you expect. This row
   is what makes a repeat `helm upgrade` a no-op (§7), so do not drop the table
   unless you intend the migration to run again.
3. **List the databases on the new instance**:

   ```bash
   kubectl exec <db>-postgresql-pg17-0 -- env PGPASSWORD=<password> \
     psql -U postgres -c '\l'
   ```

   and confirm every database you expect is present. **There is no `registry`
   database in the default topology.** `registry-api` connects with
   `POSTGRES_USER=client` and no `POSTGRES_DB`, so `registry-db-migrator`'s
   Flyway migrations -- and the registry's actual data (`records`, `aspects`,
   `events`, `recordaspects`, `webhooks`, `webhookevents`, `eventtypes`) --
   land in the cluster's **default `postgres` database**, alongside whatever
   else uses it. In a combined-db (`useCombinedDb: true`) install you should
   see `auth`, `content` and `session` here as separate databases, with the
   registry data living in `postgres` itself; in a per-service
   (`useInK8sDbInstance`) topology each `*-db` instance's own `postgres`
   database plays the same role for that service.

   Because `postgres` is excluded from the whole-database `RESTORED`/
   `EXPECTED` count above (a fresh PostgreSQL 17 instance always has a
   `postgres` database, so counting it would break the Job's own "target is
   empty, proceed" check), that count cannot see whether the registry data
   inside it actually survived the restore. The restore Job's separate
   `postgres database content check` line (step 1 above) is what verifies
   this instead: it derives an expected public-schema table count from the
   dump's own `postgres` section and compares it to what actually landed on
   the target, and hard-fails the Job -- writing no completion marker -- if
   they don't match. If you ever see a restore report `N of N database(s) now present` immediately followed by an `ERROR: the dump's "postgres" database section defines ...` line, treat it exactly like a `RESTORED`/`EXPECTED`
   mismatch (§8): the restore is incomplete and must not be treated as
   migrated.

4. **Check application health** — the gateway is reachable, dataset search
   returns your existing data, and login/authentication works.
5. **Confirm the DB migrator Jobs ran and succeeded, in the right order.** They
   are `post-upgrade` hooks at weight `-5`; the restore Job is a `post-upgrade`
   hook at weight `-10`, which runs first (lower weight sorts first), so restored
   data is already in place before Flyway applies any migration. Check the
   migrator Jobs' logs for schema errors that would indicate they ran against an
   unexpected (e.g. still-empty) database.

## 7. After verifying

Once you've confirmed the migration is correct:

1. Set `majorUpgrade.enabled: false` on every chart where you turned it on.

   It is genuinely safe to leave it on — a repeat `helm upgrade` with the flag
   still `true` is a no-op, and both hook Jobs exit 0 without doing anything:

   - the **dump** Job's very first action is to query the _target_ (the new PG17
     instance) for `public.magda_major_upgrade`. If the marker is there it prints
     "Nothing to dump" and exits 0 **without contacting `sourceHost` at all** —
     which matters, because after the first upgrade the old Service named by
     `sourceHost` no longer exists, so any attempt to dump could only fail;
   - the **restore** Job checks the same marker and exits 0 with "the target
     already holds N database(s); the migration has already run".

   Note the marker lives **inside the target database**, not on the staging
   volume. The staging PVC is a Helm hook with `hook-delete-policy: before-hook-creation`, so it is deleted and recreated **empty on every
   `helm upgrade`** while the flag is on — nothing on it survives from one
   upgrade to the next.

   Turning the flag off is still recommended: it stops the dump/restore Jobs
   (and the staging PVC) from being scheduled on future upgrades at all.

2. **Take a fresh base backup** of the new PostgreSQL 17 instance (see
   [In-cluster Database Backup & Restore](./in-cluster-database-backup-and-restore.md)).
   The v6 wal-g chain does not continue — see §3.
3. If you used `backupRestore.recoveryMode.enabled` on the old instance for any
   reason during the migration window, reset it once you no longer need it.
4. Delete the old PostgreSQL 13 data PVCs (`data-<db>-postgresql-0`) and the
   staging PVC (`<db>-postgresql-pg17-major-upgrade`) once you are confident you
   will not need to roll back or re-inspect the dump. Until you delete them, they
   consume storage but are otherwise inert.

## 8. Rolling back

If something goes wrong before you've deleted the old PVCs:

```bash
helm rollback magda -n <namespace>
```

`helm rollback` recreates the PostgreSQL 13 StatefulSet from the previous
release's manifest. Its `volumeClaimTemplate`-managed PVC (`data-<db>-postgresql-0`)
is **not** part of the Helm release manifest and is never garbage-collected by
Helm, so it was never touched by the failed upgrade attempt — the StatefulSet
rebinds it and the old data is exactly as it was.

Before retrying the upgrade:

- Delete the (empty or partially-restored) PostgreSQL 17 data PVC
  (`data-<db>-postgresql-pg17-0`).
- Delete the staging PVC (`<db>-postgresql-pg17-major-upgrade`) so the next
  attempt takes a fresh dump rather than reusing a stale one.

**A failed upgrade must not be blindly retried without doing this.** The restore
Job distinguishes three states on the target when it runs, using the
`public.magda_major_upgrade` marker table (in the target's `postgres` database)
that it writes only after its own post-restore verification passes:

- **Marker present:** a previous run of this Job already completed and verified
  the restore; it prints the marker row, exits 0 and changes nothing (the
  idempotent, safe-to-repeat case).
- **Databases present, marker absent:** a previous restore attempt started but
  was interrupted partway through — some databases may be fully loaded, one may
  have been created and left empty mid-stream, others may be missing entirely.
  The Job treats this as a **hard error** rather than guessing, because treating
  a partial restore as "already migrated" would let the DB migrators build
  schema over incomplete data and report the upgrade as green. If you hit this,
  do not re-run `helm upgrade` expecting it to fix itself: inspect the target
  instance by hand, either drop the incomplete databases and re-run the restore
  Job, or restore `/staging/dumpall.sql.gz` manually, or fall back to the
  rollback procedure above and start over from a clean staging PVC.
- **No databases and no marker:** nothing has restored yet; it proceeds normally.

The marker is deliberately **not** a file on the staging volume: **every
`helm upgrade` with `majorUpgrade.enabled` still `true` deletes and recreates the
staging PVC** (`hook-delete-policy: before-hook-creation` — a hook resource that
is not deleted first cannot be created again), destroying any dump it held. Do
not treat a dump sitting on the staging volume as durable; if you need to keep
one, copy `dumpall.sql.gz` off the volume before running another upgrade.

### A leftover hook Job blocks the next upgrade

For that PVC delete-and-recreate to work, **no pod may still be mounting the
staging PVC when the next upgrade starts.** Kubernetes' `pvc-protection`
finalizer holds a PVC open while any pod that references it exists — including a
long-finished `Completed` pod — and Helm waits for the deletion to complete, so a
leftover hook pod turns the next `helm upgrade` into:

```
Error: UPGRADE FAILED: pre-upgrade hooks failed: context deadline exceeded
```

after burning the entire `--timeout`, with the staging PVC left `Terminating`.

Both hook Jobs therefore carry `hook-delete-policy: before-hook-creation,hook-succeeded`, which deletes them the moment they succeed.
But `hook-succeeded` deliberately does **not** delete a **failed** Job (its logs
are the whole point). So if a dump or restore Job has failed, delete it before
retrying:

```bash
kubectl delete job <db>-postgresql-pg17-major-upgrade-dump \
                   <db>-postgresql-pg17-major-upgrade-restore --ignore-not-found
```

Do this **after** you have read its logs, and before re-running `helm upgrade`.
If you hit the `context deadline exceeded` error above, this is the fix — the
retry cannot clear it by itself, because the PVC hook runs (weight `-20`) before
the dump Job's own `before-hook-creation` deletion (weight `-10`) would have
released the volume.

If `postgresql.metrics.enabled` is set on the target instance, be aware the
metrics exporter sidecar keeps a session open on the `postgres` database. The
restore's `--clean` dump drops and recreates `postgres`/`template1`, so the
restore Job terminates competing sessions on those two databases immediately
before restoring — this is expected and not a sign of something else going
wrong.

## 9. Per-service instances

The `majorUpgrade` mechanism is per-`magda-postgres`-instance, not global. If you
run `global.useInK8sDbInstance.<db>: true` for individual services instead of
`global.useCombinedDb: true`, you must enable (and, if needed, override
`sourceHost` for) `majorUpgrade` **separately on each `*-db` chart** that holds
data you want migrated:

```yaml
authorization-db:
  magda-postgres:
    majorUpgrade:
      enabled: true
content-db:
  magda-postgres:
    majorUpgrade:
      enabled: true
registry-db:
  magda-postgres:
    majorUpgrade:
      enabled: true
session-db:
  magda-postgres:
    majorUpgrade:
      enabled: true
tenant-db:
  magda-postgres:
    majorUpgrade:
      enabled: true
```

This is by design — nothing automatically enables it across every instance in
your topology, so review your topology and enable it on each instance
individually rather than assuming a single flag covers them all.

## See also

- [In-cluster Database Backup & Restore](./in-cluster-database-backup-and-restore.md)
  — how the wal-g backup/restore mechanism this migration does **not** use works.
- [E2E test case: PostgreSQL major upgrade](./e2e-test-cases/postgres-major-upgrade.md)
  — the exact procedure this runbook documents, with copy-pasteable commands.
