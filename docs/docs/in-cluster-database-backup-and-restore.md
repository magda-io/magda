# In-cluster Database Backup & Restore — How It Works

This document explains **how** Magda's in-cluster PostgreSQL backup and restore machinery works internally: the two cooperating mechanisms, the scripts involved, the recovery flow, and — importantly — the **data-loss window (RPO)** you can expect in different failure scenarios.

If you are looking for **how to configure** backup/restore (storage secrets, helm values, turning it on/off), see the companion how-to: [How to Config Continuous Archiving and Point-in-Time Recovery (PITR)](./how-to-recover-with-continuous-archive-backup.md). This document is the "how it works under the hood" counterpart.

> Applies to the in-cluster PostgreSQL option (the [`magda-postgres`](../../deploy/helm/internal-charts/magda-postgres) chart, included by [`combined-db`](../../deploy/helm/internal-charts/combined-db)). If you use a managed cloud database service instead, backup/restore is handled by your provider and this document does not apply.
>
> Backup/restore is powered by [wal-g](https://github.com/wal-g/wal-g). The behaviour described here is for the currently shipped **wal-g `3.0.8-magda-edcda8b`**; the mechanics (command names, env, storage layout) may shift with future wal-g upgrades.
>
> **Why a custom build, not an upstream release.** PostgreSQL 15 changed the `BASE_BACKUP` replication-protocol grammar. Every upstream wal-g release from 1.1.0 through 3.0.8 fails `backup-push` against PostgreSQL 15+ in the **remote** mode this CronJob uses (no local `$PGDATA` access — see Mechanism 1 below): 3.0.6–3.0.8 fail with `archive/tar: invalid tar header`; 1.1.0–3.0.5 fail with a `42601` syntax error from `repl_scanner.l`. The fix ([wal-g/wal-g#2262](https://github.com/wal-g/wal-g/pull/2262)) merged to upstream `master` on 2026-05-22 — four months after v3.0.8, the newest release — and as of writing no wal-g release contains it. Magda therefore builds from a [fork release](https://github.com/magda-io/wal-g/releases/tag/v3.0.8-magda-edcda8b) (`magda-io/wal-g` at `master@edcda8bb`, which has PR #2262 as an ancestor), published as [`ghcr.io/magda-io/magda-wal-g:3.0.8-magda-edcda8b`](https://github.com/magda-io/magda-wal-g) (linux/amd64 + linux/arm64). **This is a temporary measure**: once an upstream wal-g release includes PR #2262, `magda-postgres/Dockerfile`, `magda-postgres/values.yaml` (`backupRestore.image.tag`) and `magda-int-test-ts/src/ServiceRunner.ts` should switch back to the official `wal-g/wal-g` release (the `magda-io/magda-wal-g` build already has a `WALG_REPO` build ARG so it can be pointed back at `wal-g/wal-g` when that happens).
>
> **Delta (incremental) backups are not available.** They require filesystem access to compute changed blocks from file `ModTime` and page LSNs, which only exists in wal-g's _local_ backup mode — not the remote mode above. This was evaluated and declined; see [magda-io/magda#3761](https://github.com/magda-io/magda/issues/3761) (closed as not planned). Only full base backups plus continuous WAL archiving are supported.

## Overview: two mechanisms, one scheme

When backup is enabled (`backupRestore.backup.enabled = true`), **two** mechanisms run and write to the **same** object store (S3/GCS/Azure/etc., configured via `backupRestore.storageConfig` / `storageSecretName`, exposed to wal-g as env files under `/etc/wal-g.d/env`):

| Mechanism                    | What it produces                                                 | Cadence                                                        | Driven by                                               |
| ---------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| **Base backups**             | Full snapshots of the cluster (`basebackups_005/…` in the store) | Periodic (default weekly)                                      | A Kubernetes **CronJob** running `wal-g backup-push`    |
| **Continuous WAL archiving** | Every completed 16 MB write-ahead-log segment (`wal_005/…`)      | Continuous — at least every `archive_timeout` (default 10 min) | PostgreSQL's `archive_command` calling `wal-g wal-push` |

They are **not** two alternatives you pick between — they are complementary layers of a single continuous-archiving scheme, and both switch on together with `backup.enabled`:

- A **base backup** is the anchor: a self-consistent full copy you can restore from.
- The **WAL archive** is the fine-grained stream _between_ base backups. Each base backup needs a little WAL to become internally consistent, and the archive is also what makes **roll-forward** point-in-time recovery possible (recover to a moment _after_ the last base backup rather than only to the backup itself).

Think of it as: _base backup = periodic full snapshot; WAL archive = the continuous change-log that lets you replay forward from a snapshot._

## Mechanism 1 — Base backups (the CronJob)

Template: [`deploy/helm/internal-charts/magda-postgres/templates/cronjob-backup.yaml`](../../deploy/helm/internal-charts/magda-postgres/templates/cronjob-backup.yaml)

A Kubernetes `CronJob` (`concurrencyPolicy: Forbid`, `backoffLimit: 3`, `restartPolicy: OnFailure`) runs the `magda-wal-g` image on `backup.schedule` (default `0 15 * * 6` — 15:00 UTC every Saturday). Each run:

1. **`adduser.sh`** — adds a uid-1001 entry to `/etc/passwd`. `wal-g` (dynamically linked to libc) looks up the running uid on startup. The CronJob's pod spec sets a Kubernetes `command:`, which **overrides the image's bitnami entrypoint** — so, unlike the DB pod, nss_wrapper is not initialised and uid 1001 would be unresolved. `adduser.sh` writes the missing entry so `wal-g` can run. (The DB pod keeps the entrypoint, so it does not need this — see Mechanism 2.)
2. **`wal-g backup-push`** — a **remote** base backup over PostgreSQL's replication protocol (`PGHOST` points at the DB service; no local data directory needed). This streams a full base backup to `basebackups_005/` in the store.
3. **Capture the exit code immediately** (`BACKUP_PUSH_RC=$?`). This is deliberate: any statement between `backup-push` and reading `$?` would reset it and make a **failed** backup look successful — which previously also let the retention step below prune the existing backup chain after a failure. (See issue [#3746](https://github.com/magda-io/magda/issues/3746).)
4. **Retention (success only)** — `wal-g delete --confirm retain FULL <numberOfBackupToRetain>` (default keep **7**) trims older base backups. It distinguishes "fewer backups than the retention count" from a real error by string-matching wal-g's `"not found"` output (fragile across wal-g versions; revisit on upgrade). On backup failure it **exits 1** and does **not** prune.

Relevant values (chart [`magda-postgres`](../../deploy/helm/internal-charts/magda-postgres)):

- `backupRestore.backup.schedule` — base-backup cron (default weekly).
- `backupRestore.backup.numberOfBackupToRetain` — base backups to keep (default 7).
- `backupRestore.backup.walgTarSizeThreshold` — backup bundle size (default 20 GB).

## Mechanism 2 — Continuous WAL archiving

Config: [`deploy/helm/internal-charts/magda-postgres/templates/extended-config-configmap.yaml`](../../deploy/helm/internal-charts/magda-postgres/templates/extended-config-configmap.yaml)

When `backup.enabled = true`, the DB is configured with:

```
archive_mode = on
wal_level = replica
archive_command = /usr/bin/envdir /etc/wal-g.d/env /usr/local/bin/wal-g wal-push "$PGDATA/%p"
archive_timeout = 600   # seconds; values.yaml default = 10 minutes
```

Whenever PostgreSQL fills (or, via `archive_timeout`, force-closes) a 16 MB WAL segment, `archive_command` runs `wal-g wal-push` to upload it to `wal_005/` in the store. `archive_timeout = 600` guarantees at least one segment is closed and archived every ~10 minutes even on an idle database — this is the knob that bounds how much recent change can be _un-archived_ at any instant.

> The DB pod runs the image's default bitnami entrypoint, which sets up **nss_wrapper** (`LD_PRELOAD` + `NSS_WRAPPER_PASSWD`). Because `wal-g` is dynamically linked to libc, its uid lookup is resolved by nss_wrapper even though uid 1001 is absent from `/etc/passwd` — so the DB pod's `archive_command` works without the CronJob's `adduser.sh` step. (Verified end-to-end: `pg_stat_archiver` reports archived segments with zero failures, and WAL objects land under `wal_005/`.)

Also, at DB startup [`start.sh`](../../magda-postgres/start.sh) ensures a `host replication all 0.0.0.0/0 md5` entry exists in `pg_hba.conf` so the CronJob's remote `backup-push` can connect. (PostgreSQL's `all` database keyword does **not** match physical-replication connections, so an explicit `replication` entry is required.)

## Restore / recovery flow

Recovery is **opt-in** and only happens when an operator sets `backupRestore.recoveryMode.enabled = true` (→ env `MAGDA_RECOVERY_MODE=true`). On the next DB pod start, [`start.sh`](../../magda-postgres/start.sh) sees the flag (and that `/wal-g/recovery.complete` is absent) and runs the restore scripts baked into the image under `magda-postgres/wal-g/`:

1. **[`recover.sh`](../../magda-postgres/wal-g/recover.sh)**:
   - **generates** `recovery.conf` into `conf.d` from `MAGDA_RECOVERY_TARGET` (via [`gen-recovery-conf.sh`](../../magda-postgres/wal-g/gen-recovery-conf.sh));
   - swaps in a **local-only** [`pg_hba.conf`](../../magda-postgres/wal-g/pg_hba.conf) (blocks application traffic while recovering);
   - **saves** the current `$PGDATA/pg_wal` aside (preserving any WAL not yet archived);
   - wipes `$PGDATA`;
   - `wal-g backup-fetch $PGDATA LATEST` (or a pinned `MAGDA_RECOVERY_BASE_BACKUP_NAME`);
   - restores the saved `pg_wal` back over the fetched (empty) one;
   - `touch recovery.signal` → PostgreSQL enters archive recovery.
2. **The generated `recovery.conf`** governs replay. It always sets:
   ```
   restore_command      = wal-g wal-fetch "%f" "$PGDATA/%p"   # pulls archived WAL as needed
   recovery_end_command = /wal-g/post-recovery.sh
   ```
   and the target depends on `recoveryMode.recoveryTarget` (→ `MAGDA_RECOVERY_TARGET`, default `latest`):
   - `latest` → **no** `recovery_target` (replay to the end of the archived WAL, then promote);
   - `immediate` → `recovery_target = 'immediate'` (stop at the base backup);
   - a timestamp → `recovery_target_time = '<value>'` (point-in-time recovery). A target adds `recovery_target_action = 'promote'`.
3. **[`post-recovery.sh`](../../magda-postgres/wal-g/post-recovery.sh)** runs after promotion: marks `/wal-g/recovery.complete` (so a later pod restart won't re-enter recovery), removes `recovery.conf`, restores the normal `pg_hba.conf`, and reloads to re-open remote connections. Backup, if it was on, resumes automatically.

You choose _which_ base backup with `recoveryMode.baseBackupName` (default `LATEST`).

## Data at risk (RPO) — the important part

The recovery-point objective (maximum data loss) depends on the failure mode **and** on `recoveryMode.recoveryTarget` (default `latest`):

| Scenario                                                  | Data-loss window                                                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pod restart / reschedule, data volume (PVC) intact**    | **≈ 0.** Recovery mode is off by default; PostgreSQL just does normal crash recovery from its own `pg_wal`. Nothing is discarded.             |
| **Disaster, default recovery (`recoveryTarget: latest`)** | **≈ `archive_timeout` (~10 min)** of the most recent, not-yet-archived WAL — or **~0** if the pod's local `pg_wal` survived and was replayed. |
| **Disaster, `recoveryTarget: immediate`**                 | **Up to one base-backup interval — default ≈ 7 days.**                                                                                        |
| **Point-in-time (`recoveryTarget: <timestamp>`)**         | recovers to the chosen instant (data after it is intentionally discarded).                                                                    |

By default (`recoveryTarget: latest`) recovery **rolls forward** through the archived WAL to the newest segment and promotes, so the RPO is bounded by `archive_timeout` (~10 min) — the cadence at which WAL is archived — or ~0 when the failure preserved the pod's local `pg_wal`.

Setting `recoveryTarget: immediate` restores to the **base backup only** and does not roll forward, so the RPO grows to one base-backup interval (weekly by default) — useful when you deliberately want a known-good older state. A **timestamp** target performs point-in-time recovery to that instant (pair it with a `baseBackupName` taken before the target time). Two levers still shrink the windows: shorten `backup.schedule` (smaller base-backup interval) and lower `archiveTimeout` (smaller un-archived WAL tail).

Two levers to shrink the default window:

- **Shorten `backupRestore.backup.schedule`** → more frequent base backups → smaller auto-recovery RPO.
- **Lower `backupRestore.backup.archiveTimeout`** → smaller un-archived WAL tail (at the cost of more, smaller WAL objects), which is the floor a roll-forward recovery can reach.

## Object-store layout (wal-g `3.0.8-magda-edcda8b`)

Under your configured `WALG_S3_PREFIX`:

```
<prefix>/basebackups_005/base_<segment>/metadata.json
<prefix>/basebackups_005/base_<segment>/tar_partitions/*.tar.lz4
<prefix>/basebackups_005/base_<segment>_backup_stop_sentinel.json
<prefix>/wal_005/<segment>.lz4          # one lz4 object per archived WAL segment
```

## Automated test coverage

The wal-g mechanics are exercised as a regression oracle in `magda-int-test-ts` (`src/tests/walgBackupRestore.spec.ts`, added under [#3747](https://github.com/magda-io/magda/issues/3747)): base-backup → restore fidelity, WAL push/fetch byte-identity, and a point-in-time **roll-forward** restore that recovers writes made _after_ the base backup (the property that gives continuous archiving its value). Those tests deliberately drive wal-g directly against a plain `postgres:17.5` + MinIO (a dedicated `postgres:13.7` fixture is used only for the cross-version test, which restores a backup taken by the old, pre-PG15-protocol-fix wal-g 1.1.0) — they validate the wal-g command behaviour, not the in-cluster automation wiring (the CronJob manifest and PostgreSQL's `archive_command`), which is covered by the manual end-to-end scenario under [#3750](https://github.com/magda-io/magda/issues/3750) against the real `magda-postgres` image.

## Related

- [How to Config Continuous Archiving and Point-in-Time Recovery (PITR)](./how-to-recover-with-continuous-archive-backup.md) — configuration how-to (storage, helm values).
- [`magda-postgres` chart reference](../../deploy/helm/internal-charts/magda-postgres) — all `backupRestore.*` options.
- [PostgreSQL Continuous Archiving & PITR](https://www.postgresql.org/docs/17/continuous-archiving.html) — upstream reference.
- [wal-g storage options](https://github.com/wal-g/wal-g/blob/master/docs/STORAGES.md).
