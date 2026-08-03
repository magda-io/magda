# E2E Test Case: in-cluster PostgreSQL wal-g cross-version backup / restore

A concrete, scripted end-to-end test case for the `magda-postgres` chart's wal-g
backup / restore, run against a real cluster (e.g. minikube). It produces a base
backup + WAL stream with one wal-g version and restores it under another,
verifying both **full roll-forward** and **point-in-time recovery (PITR)** survive
the version change. Run it whenever the bundled wal-g version (or the
`magda-postgres` image base) changes.

## What it covers

Deploys the `magda-postgres` chart twice against a shared in-cluster MinIO bucket:

1. **Producer** (`PRODUCER_IMG`, e.g. the currently shipped wal-g): with
   `backupRestore.backup.enabled=true`, seeds rows **A**, confirms continuous WAL
   archiving (`pg_stat_archiver.failed_count = 0`), takes a base backup, then writes
   **B**, records a PITR timestamp **T**, writes **C**, and forces a WAL switch so
   B and C are archived.
2. **Restore** (`RESTORE_IMG`, e.g. the upgraded wal-g) in `recoveryMode`:
   - `recoveryTarget: latest` → the fresh instance must recover **A + B + C** (full
     roll-forward through the archived WAL created by the *other* version).
   - `recoveryTarget: <T>` → must recover **A + B** only, stopping before **C**.

Key property this catches: the restore path drives `wal-g wal-fetch` as the
PostgreSQL `restore_command`, so it exercises wal-g's **WAL prefetch**. The
containerised integration harness (`magda-int-test-ts`) pre-stages WAL segments
instead, so it cannot catch prefetch regressions — e.g. wal-g 3.x moving prefetched
segments into `$PGDATA/pg_wal` with `rename(2)`, which fails
(`invalid cross-device link`) when `WALG_PREFETCH_DIR` is on a different filesystem
than PGDATA and silently stops roll-forward at the base backup. This case asserts
the recovered row counts, so that failure shows up as `roll-forward expected 200,
got 100`.

## Run the driver script

The driver ([`magda-postgres/scripts/e2e-cross-version-restore.sh`](../../../magda-postgres/scripts/e2e-cross-version-restore.sh))
provisions MinIO, prepares the chart (fetches the postgresql subchart dependency and
drops the umbrella-only `cronjob-backup.yaml`), runs both phases, and asserts the
row counts. With a cluster reachable (`kubectl` context set, e.g. minikube) and
`helm` + `docker` available:

```bash
PRODUCER_IMG=ghcr.io/magda-io/magda-postgres:6.1.2-alpha.0 \
RESTORE_IMG=ghcr.io/magda-io/magda-postgres:6.1.2-pr.3759.1 \
  magda-postgres/scripts/e2e-cross-version-restore.sh
```

Expected output ends with `ALL CHECKS PASSED`. Point `PRODUCER_IMG` at a
`magda-postgres` build carrying the *old* wal-g and `RESTORE_IMG` at one carrying
the *new* wal-g (e.g. a PR testing build — see
[How to Release a New Version](../ci-version-release.md)). Other env vars: `NS`
(default `walg-e2e`), `DB_PW`, `CHART_SRC` (defaults to the in-repo chart), and
`KEEP_NS=1` to skip teardown for inspection.

## Notes

- Requires cluster + `helm` + `docker`; on Apple Silicon minikube the amd64
  `magda-postgres` image runs under rosetta/qemu, so pod startup is slower — the
  script already uses generous rollout timeouts.
- The base backup step runs `adduser.sh` first: wal-g is dynamically linked and,
  under `kubectl exec`, runs without the bitnami entrypoint's `nss_wrapper`, so it
  cannot resolve its uid (1001) until a `/etc/passwd` record is added. The DB pod's
  own `archive_command` and recovery run under the entrypoint and need no such
  workaround. See [in-cluster database backup and restore](../in-cluster-database-backup-and-restore.md).
- `WALG_PREFETCH_DIR` must stay on the same filesystem as PGDATA (the chart default
  `/bitnami/postgresql/wal-g-prefetch` sits on the data PVC but outside PGDATA); a
  value on the image's overlay FS breaks roll-forward under wal-g 3.x.

## Cleanup

The script deletes its namespace (`walg-e2e` by default) at the end unless
`KEEP_NS=1` is set. To clean up a `KEEP_NS=1` run: `kubectl delete namespace walg-e2e`.
