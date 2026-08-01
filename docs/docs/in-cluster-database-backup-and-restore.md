# In-cluster Database Backup & Restore — How It Works

This document explains **how** Magda's in-cluster PostgreSQL backup and restore machinery works internally: the two cooperating mechanisms, the scripts involved, the recovery flow, and — importantly — the **data-loss window (RPO)** you can expect in different failure scenarios.

If you are looking for **how to configure** backup/restore (storage secrets, helm values, turning it on/off), see the companion how-to: [How to Config Continuous Archiving and Point-in-Time Recovery (PITR)](./how-to-recover-with-continuous-archive-backup.md). This document is the "how it works under the hood" counterpart.

> Applies to the in-cluster PostgreSQL option (the [`magda-postgres`](../../deploy/helm/internal-charts/magda-postgres) chart, included by [`combined-db`](../../deploy/helm/internal-charts/combined-db)). If you use a managed cloud database service instead, backup/restore is handled by your provider and this document does not apply.
>
> Backup/restore is powered by [wal-g](https://github.com/wal-g/wal-g). The behaviour described here is for the currently shipped **wal-g 1.1.0**; the mechanics (command names, env, storage layout) may shift with future wal-g upgrades.

## Overview: two mechanisms, one scheme

When backup is enabled (`backupRestore.backup.enabled = true`), **two** mechanisms run and write to the **same** object store (S3/GCS/Azure/etc., configured via `backupRestore.storageConfig` / `storageSecretName`, exposed to wal-g as env files under `/etc/wal-g.d/env`):

| Mechanism | What it produces | Cadence | Driven by |
| --- | --- | --- | --- |
| **Base backups** | Full snapshots of the cluster (`basebackups_005/…` in the store) | Periodic (default weekly) | A Kubernetes **CronJob** running `wal-g backup-push` |
| **Continuous WAL archiving** | Every completed 16 MB write-ahead-log segment (`wal_005/…`) | Continuous — at least every `archive_timeout` (default 10 min) | PostgreSQL's `archive_command` calling `wal-g wal-push` |

They are **not** two alternatives you pick between — they are complementary layers of a single continuous-archiving scheme, and both switch on together with `backup.enabled`:

- A **base backup** is the anchor: a self-consistent full copy you can restore from.
- The **WAL archive** is the fine-grained stream *between* base backups. Each base backup needs a little WAL to become internally consistent, and the archive is also what makes **roll-forward** point-in-time recovery possible (recover to a moment *after* the last base backup rather than only to the backup itself).

Think of it as: *base backup = periodic full snapshot; WAL archive = the continuous change-log that lets you replay forward from a snapshot.*

## Mechanism 1 — Base backups (the CronJob)

Template: [`deploy/helm/internal-charts/magda-postgres/templates/cronjob-backup.yaml`](../../deploy/helm/internal-charts/magda-postgres/templates/cronjob-backup.yaml)

A Kubernetes `CronJob` (`concurrencyPolicy: Forbid`, `backoffLimit: 3`, `restartPolicy: OnFailure`) runs the `magda-wal-g` image on `backup.schedule` (default `0 15 * * 6` — 15:00 UTC every Saturday). Each run:

1. **`adduser.sh`** — adds a uid-1001 entry to `/etc/passwd`. The PostgreSQL client library refuses to run under a uid that is not present in `/etc/passwd`; without this, every wal-g command fails.
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

Whenever PostgreSQL fills (or, via `archive_timeout`, force-closes) a 16 MB WAL segment, `archive_command` runs `wal-g wal-push` to upload it to `wal_005/` in the store. `archive_timeout = 600` guarantees at least one segment is closed and archived every ~10 minutes even on an idle database — this is the knob that bounds how much recent change can be *un-archived* at any instant.

Also, at DB startup [`start.sh`](../../magda-postgres/start.sh) ensures a `host replication all 0.0.0.0/0 md5` entry exists in `pg_hba.conf` so the CronJob's remote `backup-push` can connect. (PostgreSQL's `all` database keyword does **not** match physical-replication connections, so an explicit `replication` entry is required.)

## Restore / recovery flow

Recovery is **opt-in** and only happens when an operator sets `backupRestore.recoveryMode.enabled = true` (→ env `MAGDA_RECOVERY_MODE=true`). On the next DB pod start, [`start.sh`](../../magda-postgres/start.sh) sees the flag (and that `/wal-g/recovery.complete` is absent) and runs the restore scripts baked into the image under `magda-postgres/wal-g/`:

1. **[`recover.sh`](../../magda-postgres/wal-g/recover.sh)**:
   - copies [`recovery.conf`](../../magda-postgres/wal-g/recovery.conf) into `conf.d`;
   - swaps in a **local-only** [`pg_hba.conf`](../../magda-postgres/wal-g/pg_hba.conf) (blocks application traffic while recovering);
   - **saves** the current `$PGDATA/pg_wal` aside (preserving any WAL not yet archived);
   - wipes `$PGDATA`;
   - `wal-g backup-fetch $PGDATA LATEST` (or a pinned `MAGDA_RECOVERY_BASE_BACKUP_NAME`);
   - restores the saved `pg_wal` back over the fetched (empty) one;
   - `touch recovery.signal` → PostgreSQL enters archive recovery.
2. **[`recovery.conf`](../../magda-postgres/wal-g/recovery.conf)** governs replay:
   ```
   restore_command  = wal-g wal-fetch "%f" "$PGDATA/%p"   # pulls archived WAL as needed
   recovery_target  = 'immediate'
   recovery_target_action = 'promote'
   recovery_end_command   = /wal-g/post-recovery.sh
   ```
3. **[`post-recovery.sh`](../../magda-postgres/wal-g/post-recovery.sh)** runs after promotion: marks `/wal-g/recovery.complete` (so a later pod restart won't re-enter recovery), removes `recovery.conf`, restores the normal `pg_hba.conf`, and reloads to re-open remote connections. Backup, if it was on, resumes automatically.

You choose *which* base backup with `recoveryMode.baseBackupName` (default `LATEST`).

## Data at risk (RPO) — the important part

The recovery-point objective (maximum data loss) depends on the failure mode **and** on one config detail in `recovery.conf`:

| Scenario | Data-loss window |
| --- | --- |
| **Pod restart / reschedule, data volume (PVC) intact** | **≈ 0.** Recovery mode is off by default; PostgreSQL just does normal crash recovery from its own `pg_wal`. Nothing is discarded. |
| **Disaster, restore via the shipped auto-recovery** | **Up to one base-backup interval — default ≈ 7 days.** |
| **Disaster, manual full point-in-time recovery (roll-forward)** | **≈ `archive_timeout` (~10 min)** of the most recent, not-yet-archived WAL. |

The critical detail is **`recovery_target = 'immediate'`**: it tells PostgreSQL to end replay the instant it reaches a consistent state — the **end of the base backup** — and promote. It does **not** roll forward through the WAL archived *since* that backup, even though that WAL is in the store every ~10 minutes. So the shipped automated restore lands you at the **latest base backup** (weekly by default). This matches the existing how-to's wording that recovery restores "with the LATEST base backup".

To actually exploit the ~10-minute WAL cadence you perform a **manual, full point-in-time recovery**: drop `recovery_target = immediate` (or set an explicit `recovery_target_time`) so replay rolls forward through the archived WAL to (or near) the moment of failure — bringing the RPO down to roughly `archive_timeout`, or to 0 if the local `pg_wal` survived and is replayed.

Two levers to shrink the default window:

- **Shorten `backupRestore.backup.schedule`** → more frequent base backups → smaller auto-recovery RPO.
- **Lower `backupRestore.backup.archiveTimeout`** → smaller un-archived WAL tail (at the cost of more, smaller WAL objects), which is the floor a roll-forward recovery can reach.

## Object-store layout (wal-g 1.1.0)

Under your configured `WALG_S3_PREFIX`:

```
<prefix>/basebackups_005/base_<segment>/metadata.json
<prefix>/basebackups_005/base_<segment>/tar_partitions/*.tar.lz4
<prefix>/basebackups_005/base_<segment>_backup_stop_sentinel.json
<prefix>/wal_005/<segment>.lz4          # one lz4 object per archived WAL segment
```

## Automated test coverage

The wal-g mechanics are exercised as a regression oracle in `magda-int-test-ts` (`src/tests/walgBackupRestore.spec.ts`, added under [#3747](https://github.com/magda-io/magda/issues/3747)): base-backup → restore fidelity, WAL push/fetch byte-identity, and a point-in-time **roll-forward** restore that recovers writes made *after* the base backup (the property that gives continuous archiving its value). Those tests deliberately drive wal-g directly against a plain `postgres:13.7` + MinIO — they validate the wal-g command behaviour, not the in-cluster automation wiring (the CronJob manifest and PostgreSQL's `archive_command`), which is covered by the manual end-to-end scenario under [#3750](https://github.com/magda-io/magda/issues/3750) against the real `magda-postgres` image.

## Related

- [How to Config Continuous Archiving and Point-in-Time Recovery (PITR)](./how-to-recover-with-continuous-archive-backup.md) — configuration how-to (storage, helm values).
- [`magda-postgres` chart reference](../../deploy/helm/internal-charts/magda-postgres) — all `backupRestore.*` options.
- [PostgreSQL Continuous Archiving & PITR](https://www.postgresql.org/docs/13/continuous-archiving.html) — upstream reference.
- [wal-g storage options](https://github.com/wal-g/wal-g/blob/master/docs/STORAGES.md).
