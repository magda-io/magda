# How the PostgreSQL Major Upgrade Mechanism Works

This is the implementation-level companion to the
[PostgreSQL major upgrade runbook](./postgres-major-upgrade-runbook.md) (what to
do, operationally) and the
[E2E test case](./e2e-test-cases/postgres-major-upgrade.md) (the exact procedure
that exercises it end-to-end). This document explains **how the mechanism works
and why it is built this way**, for anyone who has to modify, debug, or extend
it. It is written against the three Helm hook templates in the
[`magda-postgres`](../../deploy/helm/internal-charts/magda-postgres) chart:

- `templates/major-upgrade-pvc.yaml`
- `templates/major-upgrade-dump-job.yaml`
- `templates/major-upgrade-restore-job.yaml`

Read those alongside this document — this explains the _why_, they are the
source of truth for the _exact current behaviour_.

## 1. Why a side-by-side migration at all

PostgreSQL does not guarantee on-disk data-file compatibility across major
versions, so a PostgreSQL 17 server cannot start against a PostgreSQL 13 data
directory. That alone would rule out reusing the data PVC in place, but it
doesn't rule out reusing the _StatefulSet_.

What actually forces a side-by-side install is a label. The `postgresql`
subchart version used for PostgreSQL 17 (`16.7.24`) sets
`app.kubernetes.io/component: primary` on the pod template, and that label is
folded into the StatefulSet's `spec.selector`
(`postgresql/templates/primary/statefulset.yaml`, both in `spec.selector.matchLabels`
and the pod template labels). A StatefulSet's `spec.selector` is immutable after
creation — Kubernetes rejects any attempt to change it — so there is no version
of `helm upgrade` that can roll a new subchart's selector onto an existing
StatefulSet object.

Because of that, `magda-postgres` doesn't try. `postgresql.fullnameOverride` is
set to `<db>-postgresql-pg17`, so the PostgreSQL 17 instance renders as a **new**
StatefulSet, Service and PVC, next to the old PostgreSQL 13
`<db>-postgresql` ones. The old StatefulSet is not in the new release manifest at
all — a plain `helm upgrade` without the `majorUpgrade` mechanism deletes it (Helm
prunes resources that drop out of the manifest) but its PVC is **not** part of the
Helm-managed manifest (PVCs created via a StatefulSet's `volumeClaimTemplate` are
never owned by the release) and so is never garbage-collected. That's what makes
`helm rollback` viable: the old data is sitting there, untouched, whether or not
you ever ran the migration.

This mechanism is the piece that carries your data across that gap: a
`pg_dumpall` logical dump of the still-running old instance, taken before Helm
touches anything, replayed into the new instance after Helm has created it.

## 2. The three hook resources

| Resource                         | Hook phase     | Weight | Purpose                             |
| -------------------------------- | -------------- | ------ | ----------------------------------- |
| `major-upgrade-pvc.yaml`         | `pre-upgrade`  | `-20`  | Staging volume for the gzipped dump |
| `major-upgrade-dump-job.yaml`    | `pre-upgrade`  | `-10`  | Dumps the old instance              |
| `major-upgrade-restore-job.yaml` | `post-upgrade` | `-10`  | Restores into the new instance      |

All three render only when `majorUpgrade.enabled` is `true` — a fresh install
never sees any of this, both because it's guarded by the value and because these
are all `upgrade`-only hook annotations (no `post-install`).

Helm runs hooks within a phase in ascending weight order, and every
`pre-upgrade` hook completes before Helm's main pass (which creates/updates the
release's normal resources, including the new StatefulSet), which in turn
completes before any `post-upgrade` hook starts. So within one `helm upgrade`
that crosses the major version, the order is:

1. **`pre-upgrade` / `-20`** — the staging PVC is created (or re-created; see
   §7).
2. **`pre-upgrade` / `-10`** — the dump Job runs. The _old_ PostgreSQL 13
   StatefulSet still exists and is still serving at this point — Helm hasn't
   touched the manifest yet — so this is the only phase in which a dump off the
   old instance is guaranteed to have something to dump from.
3. **Helm's main pass** — the release manifest is reconciled. The old
   StatefulSet (no longer in the manifest) is deleted; the new PostgreSQL 17
   StatefulSet, Service, etc. are created and the pod starts.
4. **`post-upgrade` / `-10`** — the restore Job runs, loading the dump into the
   now-running PostgreSQL 17 instance.
5. **`post-upgrade` / `-5`** — the DB migrator Jobs (`registry-db`,
   `authorization-db`, `content-db`, `session-db`, `tenant-db`, one per logical
   database in play) run Flyway. `-5` sorts **after** `-10`, so restored data —
   including each database's existing `flyway_schema_history` — is already in
   place before the migrators run. Without this ordering the migrators would
   build fresh schema over an empty database, and the restore would then either
   overwrite it or (more likely) fail the RESTORED/EXPECTED check trying to load
   over pre-existing objects.

The staging PVC has to exist before the dump Job (hence `-20` before `-10`), and
has to survive from the `pre-upgrade` dump to the `post-upgrade` restore — it's
the same object, referenced by name, mounted by both Jobs.

Both Jobs call `{{- include "magda.imagePullSecrets" . | indent 6 }}` with the
**bare root context** (`.`), not `(dict "image" .Values.postgresql.image)` or
similar. That distinction matters: `magda-common/templates/_image.tpl`'s
`magda.image.getConsolidatedPullSecretList` reads `$values := get . "Values" | default dict` and then `$global := $values.global`. A dict literal like
`(dict "image" ...)` has no `Values` key at all, so `$values` and `$global`
both silently resolve to `{}`, and `global.image.pullSecrets` — the
release-wide pull secret most Magda deployments actually rely on — is dropped
from the rendered Job with no error. Passing the context bare is what lets the
global pull secret reach these Jobs.

Both Jobs' pods also carry a pod-level `securityContext` with `fsGroup: 1001` and
`fsGroupChangePolicy: Always`. This isn't decorative: without `fsGroup`, the
staging PVC's mounted files are owned by whatever UID/GID the CSI driver
happens to create the volume with, which on a real CSI-backed cluster is not
necessarily writable by the container's non-root `runAsUser: 1001`, and the Job
fails trying to write the dump or read it back. minikube's `hostpath` storage
class mounts with `0777` permissions regardless of `fsGroup`, which is exactly
why this class of bug is easy to miss in local testing and only shows up
against a real cluster's CSI driver.

## 3. The dump Job

Runs as a `pre-upgrade` hook, connecting to `PGHOST` = `majorUpgrade.sourceHost`
(the _old_ instance) using `magda.postgres-superuser-env` credentials shared with
the new instance (both use `global.postgresql.auth.existingSecret`).

**Before dumping anything, it runs two independent guards:**

1. **Repeat-upgrade no-op.** It queries `TARGET_PGHOST` — the _new_, PostgreSQL
   17 instance, **not** the source — for the `public.magda_major_upgrade`
   marker (see §5). If the marker's row count is non-zero, it prints "Nothing to
   dump" and exits `0` **without ever contacting `sourceHost`**. This matters
   because after the first successful upgrade, the Service named by
   `sourceHost` no longer exists (or points at something else) — a repeat
   upgrade with `majorUpgrade.enabled` still `true` must not attempt to dump
   from it. If the target is simply unreachable (expected on the very first
   upgrade — the new instance doesn't exist yet, since it's created in Helm's
   main pass, which runs _after_ this hook), the Job proceeds; the restore Job
   re-checks the same marker later and is the actual backstop against loading
   over live data.
2. **Local re-entry check.** If `/staging/dumpall.sql.gz.complete` and a
   non-empty `/staging/dumpall.sql.gz` are already present (e.g. the Job pod
   was recreated after `pg_dumpall` already finished but before the Job
   reported success), it skips straight to done.

**Then it validates the source itself**, after waiting (bounded by
`majorUpgrade.waitTimeoutSeconds`) for `PGHOST` to accept connections:

- It reads `server_version_num` from the source via `SHOW server_version_num`.
- **If that value isn't a plain integer**, it aborts with "could not determine
  the PostgreSQL version of \<host\>". Refusing to guess here matters for the
  same reason as the `[`/`errexit` issue described in §7 — a validation step
  that doesn't hard-fail on a bad value degrades into "proceed anyway".
- **If `server_version_num >= 170000`**, it aborts with an explicit "already
  running PostgreSQL 17 (or later)" message. This is the guard against the most
  dangerous misconfiguration: `sourceHost` accidentally pointing at the _new_
  instance. That's a server that's genuinely reachable and would produce a
  perfectly valid, non-empty-looking dump — of an empty database — and the
  upgrade would go green over nothing. Both of these abort in the `pre-upgrade`
  phase, before Helm has touched any resource, so nothing has changed when the
  operator sees the error.

**The dump pipeline itself:**

```bash
rm -f "$DUMP"
pg_dumpall --host="$PGHOST" --clean --if-exists | gzip > "$DUMP"
```

`--clean --if-exists` makes the dump self-contained: it includes `DROP DATABASE`/`DROP ROLE` statements ahead of the `CREATE`s, so replaying it against
a database that already has some objects (including a bootstrap `postgres`
database) doesn't collide with them — this is what the restore side later has
to work around for the `postgres` superuser role itself (§4).

The completion marker file, `dumpall.sql.gz.complete`, is written with `touch`
**only after all three of** `pg_dumpall`/`gzip` succeeding under `set -o pipefail` (a mid-pipe `pg_dumpall` failure would otherwise be masked by `gzip`'s
own exit code), a non-empty check (`[ -s "$DUMP" ]`), and a `gzip -t` integrity
check on the resulting file. Any one of those failing exits non-zero before
`touch` runs. The point is that the marker file's mere existence is what the
restore Job treats as "there is a usable dump on the staging volume" — so it
must never be written except once a byte-for-byte-intact dump is confirmed on
disk.

## 4. The restore Job

Runs as a `post-upgrade` hook, connecting to `PGHOST` = the _new_ instance
(`postgresql.fullnameOverride` of the chart being rendered).

**Prerequisite: `global.postgresql.auth.username` must be `postgres`.** The Job
fails fast, before touching anything, if `$PGUSER != "postgres"`. The reason is
downstream, in the role-filter step below: `pg_dumpall --clean --if-exists`
always emits `DROP ROLE IF EXISTS postgres;` / `CREATE ROLE postgres;` for the
bootstrap superuser, using its literal, unquoted name. The filter that removes
those two lines only ever looks for the literal string `postgres` — it does not
attempt to reproduce PostgreSQL's identifier-quoting rules (`fmtId()`) for an
arbitrary custom privileged username. Restoring while connected as a
non-`postgres` privileged user would hit `pg_dumpall`'s `DROP ROLE IF EXISTS postgres;` unfiltered and fail immediately with "cannot drop role postgres
because it is required by the database system" — PostgreSQL refuses to drop a
role that is the current session's own role, or that's required by the system.
Failing fast with an actionable message beats letting that error surface deep in
the restore pipeline.

**Idempotency check**, before touching the target: this is the three-way
decision described in full in §5 (present-and-verified → no-op; databases
present but marker absent → hard error; neither → proceed). It's driven by
`EXISTING` (a count of non-system databases already on the target) and the
marker's row count, both validated as plain integers before being compared or
interpolated (see §7 for why that validation is not optional).

**Clearing sessions before `--clean` runs.** `pg_dumpall --clean --if-exists`'s
replayed statements `DROP DATABASE ... ; CREATE DATABASE postgres...; DROP DATABASE ...; CREATE DATABASE template1 ...;` fail under `ON_ERROR_STOP=1` if
any other session holds a connection to either database — deterministic when
`postgresql.metrics.enabled=true` (the exporter sidecar keeps a session open on
`postgres`), a race otherwise. The restore Job terminates every other backend on
`postgres` and `template1` (`pg_terminate_backend`, excluding its own
`pg_backend_pid()`) immediately before running the restore pipeline. This can't
mask a real failure: terminating a session this role can't see or signal just
returns `false` in the result row, it doesn't error.

**The restore pipeline and the `awk` role filter:**

```bash
gunzip -c "$DUMP" \
  | awk -v u="$PGUSER" '
      BEGIN { d = "DROP ROLE IF EXISTS " u ";"; c = "CREATE ROLE " u ";" }
      /^\\connect / { indb = 1 }
      !indb && ($0 == d || $0 == c) { next }
      { print }' \
  | psql -h "$PGHOST" -d postgres -v ON_ERROR_STOP=1
```

The `awk` filter drops the bootstrap `postgres` role's own `DROP ROLE IF EXISTS postgres;` / `CREATE ROLE postgres;` lines (both impossible to apply —
you can't drop the role you're connected as — and unnecessary, since that role
is guaranteed to already exist on a target the readiness/`EXISTING` checks
already authenticated against as it). Every other role is unaffected and still
dropped/recreated as dumped, and the `ALTER ROLE ... WITH ...` statement
`pg_dumpall` also emits for the connecting role still runs, reconciling its
attributes.

**Why the filter is scoped to before the first `\connect`.** The `indb` flag is
set the moment an `awk` line matches `/^\\connect /`, and once set it is never
cleared — the filter condition (`!indb && (...)`) is then permanently false for
the rest of the stream. `pg_dumpall`'s output is a **globals header**
(roles, tablespaces — one bare `DROP ROLE IF EXISTS postgres;` / `CREATE ROLE postgres;` pair, as plain SQL statements) followed by one `\connect <db>` block
per database, each containing that database's DDL **and its literal `COPY ... FROM stdin` data rows**. The globals header, before the first `\connect`, is the
_only_ place those two exact strings can legitimately appear as SQL statements.
After the first `\connect`, every line is either DDL or a data row — and a data
row can, by coincidence, be byte-identical to `DROP ROLE IF EXISTS postgres;`
or `CREATE ROLE postgres;` (e.g. a text column holding exactly that string). An
**unconditional** filter (no `indb` guard) would silently drop that row instead
of a statement — `psql` still exits `0`, no warning, no error — a real, quiet
data loss. This was reproduced directly: a 3-row table whose data happened to
include one of those two literal strings restored as a 1-row table, with `psql`
exiting `0` throughout. Once `indb` is set, the filter never matches again, so
only the globals header is ever touched — that's the entire fix.

**`RESTORED` vs `EXPECTED` verification**, after the pipeline completes:

- `RESTORED` — count of non-system databases (excluding `postgres`,
  `template0`, `template1`) now present on the target.
- `EXPECTED` — count of `^CREATE DATABASE` lines in the dump, excluding the
  `postgres` and `template1` ones that `--clean` always emits alongside the
  per-database ones, so the comparison is apples-to-apples with `RESTORED`'s
  exclusions.

If `RESTORED` is `0`, or `RESTORED != EXPECTED`, the Job hard-errors: "a partial
restore must not be reported as a success." Only once this passes does the Job
record completion — see §5.

## 5. The marker table lifecycle

`public.magda_major_upgrade` is a one-row table in the **target's `postgres`
database** (i.e. the new PostgreSQL 17 instance, not the old one). It is the
single source of truth both Jobs consult to decide whether a migration has
already completed, and it is the mechanism that makes leaving
`majorUpgrade.enabled=true` on safe indefinitely.

```sql
CREATE TABLE IF NOT EXISTS public.magda_major_upgrade (
  completed_at        timestamptz NOT NULL DEFAULT now(),
  databases_restored   integer     NOT NULL,
  server_version       text        NOT NULL
);
```

**The presence probe is deliberately two separate queries, not one:**

```sql
-- 1.
SELECT to_regclass('public.magda_major_upgrade') IS NOT NULL
-- 2. (only run if 1 returned `t`)
SELECT count(*) FROM public.magda_major_upgrade
```

A single-query form —
`SELECT CASE WHEN to_regclass('public.magda_major_upgrade') IS NULL THEN 0 ELSE (SELECT count(*) FROM public.magda_major_upgrade) END` — does **not** work.
PostgreSQL resolves every table name referenced anywhere in a query at _parse_
time, for every branch of a `CASE`, regardless of which branch would actually
be taken at runtime. So that single-query form still throws `relation "public.magda_major_upgrade" does not exist` on a target that has never been
migrated — verified against a real `postgres:17.5` server — which is exactly
the case this probe exists to handle without erroring. Checking existence first
with `to_regclass` (which returns `NULL` rather than erroring when the relation
doesn't exist) and only then querying `count(*)` is what actually achieves
"absent table → `0`, not an error." Both dump and restore Jobs embed
byte-identical copies of both SQL strings; if you change one, change both.

The probe also deliberately counts **rows**, not just the table's existence. A
restore that died between its `CREATE TABLE` and its `INSERT` (which cannot
happen with the current code, since both are one `psql -c` — see below — but
_could_ happen if that were ever split) would leave an empty table that a bare
existence check would misread as "migrated."

**When the marker is created.** Only after the restore Job's own
`RESTORED`-vs-`EXPECTED` verification (§4) passes. The `CREATE TABLE IF NOT EXISTS` and the `INSERT` are both arguments to a single `psql -c "...; ...;"` call — one implicit transaction — so "the table exists" and "a completed
migration was recorded" can never come apart: there is no window where the
table exists without the row that explains it.

**When the marker is dropped.** Unconditionally
(`DROP TABLE IF EXISTS public.magda_major_upgrade`), immediately after the
restore pipeline runs, and — critically — **before** `RESTORED`/`EXPECTED` are
even computed, let alone before this run's own `INSERT`.

**Why the drop is essential.** `pg_dumpall --clean --if-exists` dumps the
`postgres` database like any other database in its `\connect` list — and that
means it dumps `public.magda_major_upgrade` itself, including whatever row a
_previous_ generation's restore already wrote into it, early in the stream
(verified against a real `postgres:17.5` server: the table's `CREATE TABLE` /
`COPY ... FROM stdin` appear right after `\connect postgres`, before any user
database). Without the unconditional drop, replaying that dump would silently
resurrect the _previous_ generation's marker row on the new target — well
before _this_ run's own verification has had any chance to run. Consider a
future `pg17 → pg18` migration: if that restore's pipeline replays the dump
(reinstating the pg17-era marker row) and then the restore process dies before
its own `INSERT`, a retry would find `ALREADY_MIGRATED != 0` from the
_inherited_ row and take the "already migrated, exit 0" branch — over a target
that was never actually finished for pg18. Dropping the table unconditionally,
after the pipeline but strictly before this run's own verification and its own
`INSERT`, guarantees the only marker that can exist when the script exits is
the one _this_ run wrote, after _this_ run's own checks passed — never one
inherited from the dump.

Put together, the ordering within the restore Job is:

```
restore pipeline (awk | psql)
  → DROP TABLE IF EXISTS public.magda_major_upgrade   (unconditional)
  → compute RESTORED, EXPECTED
  → verify RESTORED != 0 and RESTORED == EXPECTED       (hard error if not)
  → CREATE TABLE + INSERT, one psql -c                  (only reached on success)
```

## 6. Why the marker lives in the database, not a ConfigMap

The marker has to travel with the data it describes, and a database is the only
thing that can guarantee that. A Kubernetes-side marker — a ConfigMap, an
annotation, anything living outside the PostgreSQL data files — can diverge
from the database it's meant to describe. For example: restore the PG17 data
PVC from a pre-migration volume snapshot (or any physical-layer recovery) and a
ConfigMap marker would still claim "migrated," even though the database
underneath it is back to empty/pre-migration. Both Jobs would then read that
marker, treat it as authoritative, and no-op — a green upgrade over an
effectively empty database, with nothing in the mechanism able to notice.
Putting the marker inside the database itself means it can only ever describe
the database it's actually sitting in.

There's a second, smaller consequence worth knowing if you're tempted to change
this: neither Job currently needs **any** Kubernetes API access — no
`serviceAccountName`, no Role, no RoleBinding are defined anywhere in this
chart for them. A ConfigMap-based marker would need to add all of that (read
today, read-and-write across upgrades), purely to track state that the
PostgreSQL instance can already hold more reliably by itself.

## 7. Idempotency and the delete policies

Both the dump and restore Jobs carry:

```yaml
"helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
```

**`before-hook-creation`** is required simply because a hook resource that
isn't deleted before it fires again fails to (re-)create on the next `helm upgrade` — Helm would try to create an object with a name that already exists.

**`hook-succeeded`** deletes the Job (and its pod) the moment it succeeds. This
is required for a reason that isn't obvious from the annotation alone: both
Jobs' pods mount the staging PVC, and for as long as a pod referencing a PVC
exists, Kubernetes' `pvc-protection` finalizer holds that PVC open. The staging
PVC hook is `pre-upgrade`/`-20` with `before-hook-creation` (§2) — it has to
delete-and-recreate the PVC on _every_ upgrade while `majorUpgrade.enabled` is
`true`. If a Job pod from the previous upgrade is still sitting around
referencing that PVC, the PVC delete blocks forever behind the finalizer, and
the _next_ `helm upgrade` fails with:

```
Error: UPGRADE FAILED: pre-upgrade hooks failed: context deadline exceeded
```

after burning the entire `--timeout`, with the PVC left `Terminating`. This was
reproduced on a live cluster — the PVC's `uid` stayed unchanged across the
failed retry, proving the delete never actually completed.

**`hook-failed` is deliberately excluded.** A _failed_ dump or restore Job's
pod, and its logs, are the only record of what went wrong, and they need to
survive so an operator can `kubectl logs` them. Only a Job that _succeeds_ is
deleted; a failed one is left in place — which means, per the paragraph above,
that its pod is also still pinning the staging PVC. **The consequence: a failed
Job must be manually deleted (`kubectl delete job ...`) before retrying the
upgrade** — a bare re-run of `helm upgrade` hits the exact "context deadline
exceeded" failure above, because the PVC hook (weight `-20`) runs before the
failed Job's own deletion ever would (it isn't going to happen on its own,
since `hook-failed` was intentionally left out). See the runbook's [§8, "A
leftover hook Job blocks the next upgrade"](./postgres-major-upgrade-runbook.md#a-leftover-hook-job-blocks-the-next-upgrade)
for the operator-facing recovery steps.

There's a second, unrelated form of idempotency: the `case ... esac` validation
that precedes almost every numeric `[ ... ]` comparison in both scripts (e.g.
`ALREADY_MIGRATED`, `SOURCE_VERSION_NUM`, `EXISTING`, `RESTORED`). This exists
because `[` is the condition of an `if`, and **conditions are exempt from `set -o errexit`** — a non-numeric value fed to `[ "$x" -ge N ]` makes `[` itself
exit `2` ("integer expression expected"), and the surrounding `if` reads a
non-zero exit as simply "false," not as a script-ending error. Without the
`case` guard rejecting anything that isn't a plain non-negative integer first,
a query returning something unexpected (an error string swallowed by `|| echo 'QUERY_FAILED'`, an empty result, etc.) would silently be treated as "the check
passed" rather than aborting. This exact class of bug shipped once in this code
already, which is why every numeric comparison in both scripts is preceded by
one of these guards.

## 8. Failure modes and where to recover

| Symptom                                                                                                                         | Cause                                                                                                              | Recovery                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Error: UPGRADE FAILED: pre-upgrade hooks failed: context deadline exceeded`, staging PVC stuck `Terminating`                   | A previous dump/restore Job failed and was left in place (by design — see §7); its pod still pins the staging PVC  | `kubectl delete job <db>-postgresql-pg17-major-upgrade-dump <db>-postgresql-pg17-major-upgrade-restore --ignore-not-found`, **after** reading their logs, then retry. Runbook [§8](./postgres-major-upgrade-runbook.md#8-rolling-back).                                                        |
| Dump Job: `ERROR: could not reach the source PostgreSQL server "<host>"`                                                        | `majorUpgrade.sourceHost` is wrong, or the old instance isn't running                                              | Fix `sourceHost`; nothing has changed yet (fails before any resource is touched). Runbook §5.                                                                                                                                                                                                  |
| Dump Job: `ERROR: the source server <host> reports server_version_num=..., i.e. it is already running PostgreSQL 17 (or later)` | `sourceHost` points at the _new_ instance instead of the old one                                                   | Fix `sourceHost` to name the previous major's Service. Runbook §5.                                                                                                                                                                                                                             |
| Dump Job: `ERROR: could not determine the PostgreSQL version of <host>`                                                         | `SHOW server_version_num` didn't return a plain integer (unreachable mid-query, unexpected output)                 | Investigate connectivity/credentials to the source; nothing has changed.                                                                                                                                                                                                                       |
| Restore Job: `ERROR: majorUpgrade requires global.postgresql.auth.username=postgres`                                            | A non-default privileged username is configured                                                                    | Set `global.postgresql.auth.username: postgres` for the duration of the migration. Runbook §4.                                                                                                                                                                                                 |
| Restore Job: `ERROR: the target holds N database(s) but public.magda_major_upgrade ... is absent`                               | A previous restore attempt started but was interrupted partway through                                             | **Do not just retry.** Inspect the target by hand — drop the incomplete databases and re-run the restore Job, or restore `dumpall.sql.gz` manually, or fall back to `helm rollback` and start over from a clean staging PVC. Runbook [§8](./postgres-major-upgrade-runbook.md#8-rolling-back). |
| Restore Job: `ERROR: restored N database(s) but the dump names M`                                                               | The restore pipeline ran but didn't fully replay (dump truncated, a mid-stream error `ON_ERROR_STOP` didn't catch) | Investigate the restore Job's logs for the actual `psql` error; the target is left in the "databases present, marker absent" state above on the next attempt.                                                                                                                                  |
| `helm upgrade` exceeds the default 5-minute timeout while the restore Job is still running underneath it                        | `--timeout` wasn't sized for a real dump + restore                                                                 | Always pass an explicit, generous `--timeout` (e.g. `3600s`). Runbook §5. Whatever the restore pod ends up doing, it still pins the staging PVC — see the first row of this table before retrying.                                                                                             |

For the full operator-facing procedure (prerequisites, verification steps,
rollback, per-service instances), see the
[PostgreSQL major upgrade runbook](./postgres-major-upgrade-runbook.md).
