# PostgreSQL Upgrade & Migration Pathways (v6 → v7)

Magda v7 upgrades the **bundled, in-cluster** PostgreSQL from 13.7 to 17.5. If you
run the in-cluster database, your existing v6 data does **not** move into
PostgreSQL 17 by itself — a plain `helm upgrade` gives you a new, empty PostgreSQL
17 instance. This page helps you pick the right route to carry your data forward,
and links to the detailed procedure for each.

If you already run a **managed / cloud** database (AWS RDS, Azure Database for
PostgreSQL, GCP Cloud SQL), the upgrade is mostly a no-op — see Pathway C.

## First: wal-g backups are not a migration path

Before you choose a route, clear up the single most common misconception. The
in-cluster [wal-g backup/restore mechanism](./in-cluster-database-backup-and-restore.md)
is a **rollback net, not a migration tool**:

- `wal-g backup-fetch` restores a **physical** copy of the data directory. A base
  backup taken from a PostgreSQL 13 server can only ever be restored into a
  PostgreSQL **13** server — the on-disk files are not readable by PostgreSQL 17.
- So enabling wal-g before an upgrade gives you **rollback-to-13**. It is **not** a
  way to load data into PostgreSQL 17, and **not** a way to load data into a
  managed database either.

Every migration below therefore uses a **logical** dump/restore
(`pg_dumpall` / `pg_dump` + `psql`), which is immune to the on-disk format change
and works across servers.

## Pick your pathway

| | Your database today | Where you want to end up | Route |
| --- | --- | --- | --- |
| **A** | In-cluster PostgreSQL 13 (the bundled `magda-postgres`) | In-cluster PostgreSQL 17 (bundled DB stays) | Automated in-cluster dump/restore during the v7 `helm upgrade` |
| **B** | In-cluster PostgreSQL 13 | A managed / cloud database (RDS / Azure / Cloud SQL) | Move to the managed DB first (still on v6), then upgrade to v7 |
| **C** | Already on a managed / cloud database | Same managed DB, on v7 | Mostly a no-op — external-DB config carries over |

If more than one looks plausible: choose **A** to keep operating the database
yourself with the least change; choose **B** if v7 is the moment you want to hand
PostgreSQL operation to a cloud provider; you are on **C** only if Magda already
talks to an external database today (`global.useAwsRdsDb`, `global.useCloudSql`, or
a per-service external host).

## Pathway A — in-cluster PostgreSQL 13 → in-cluster PostgreSQL 17

The bundled database stays in the cluster. During the v6 → v7 `helm upgrade`, a
Helm-hook Job does a **logical** `pg_dumpall` from the still-running PostgreSQL 13
instance over the network and loads it into the new PostgreSQL 17 instance,
**before** the schema migrators run. The old PostgreSQL 13 data PVC is never
touched, so a rollback is `helm rollback` plus flipping back to the old instance.

- **[Runbook: PostgreSQL Major Upgrade (in-cluster)](./postgres-major-upgrade-runbook.md)** —
  the operator-facing procedure: enabling `majorUpgrade`, the `--timeout` you must
  set, verification, rollback, and per-service instances.
- **[How the in-cluster major upgrade works](./postgres-major-upgrade-mechanism.md)** —
  the mechanism internals: the hook Jobs, the `magda_major_upgrade` marker table,
  and why reading over the network avoids the physical `pg_upgrade` collation
  hazard.

Downtime lasts for the duration of the dump plus the restore; size your
`--timeout` and staging volume accordingly (both covered in the runbook).

## Pathway B — in-cluster PostgreSQL 13 → managed / cloud database

Use this when v7 is the point at which you want to stop running PostgreSQL
in-cluster and hand it to a cloud provider. You copy the data out of the
still-running in-cluster database into the managed database, then **cut over as
part of the v7 upgrade** — pointing Magda at the managed database in the same
`helm upgrade` that moves you to v7. At that point the version of PostgreSQL is
owned by your provider and the in-cluster `majorUpgrade` mechanism does not apply.

The move is a **logical** `pg_dump` of each database over the network from the
still-running in-cluster database into the managed database (plus recreating the
`client` role and its grants). Two things are worth knowing up front, both because
managed services give you **no PostgreSQL superuser**: a single `pg_dumpall` is
deliberately **not** used (its role/ownership assumptions fail), and you should
**cut over at the v7 upgrade rather than pointing an earlier version at the managed
database first** — only v7's DB migrators connect to a TLS-enforcing managed
database. The how-to explains both.

- **[How to migrate the in-cluster database to a managed / cloud database](./migration/in-cluster-postgres-to-managed-db.md)** —
  the full procedure, including the wal-g caveat, the exact dump/restore commands,
  the Helm values to switch Magda to the external database, verification and
  cutover.

Your managed instance must run a PostgreSQL version Magda supports (13–17). Once
you have moved, subsequent Magda upgrades follow Pathway C.

## Pathway C — already on a managed / cloud database

If Magda already talks to an external database, the v7 upgrade **does not touch
your data**. The `majorUpgrade.*` values apply only to the in-cluster option and
have no effect here; the PostgreSQL version — and any major-version upgrade of it —
is owned by your provider.

To upgrade:

1. Make sure your managed instance runs a PostgreSQL version Magda supports
   (**13–17**). If you need to move it to a newer major version, that is a
   provider-side operation — see your provider's tooling (for GCP,
   [Upgrading Google Cloud SQL using Google DMS](./migration/upgrade-google-cloud-sql-using-google-dms.md)
   is an existing example of a provider-driven major upgrade).
2. Run the v7 `helm upgrade` with your existing external-database values
   unchanged. See [Deploy Magda on AWS EKS](./deploy-to-aws.md) and
   [Deploy Magda on Azure AKS](./deploy-to-azure.md) for the external-database
   value contract (`global.useCombinedDb`, `global.useAwsRdsDb` /
   `global.useCloudSql`, `global.awsRdsEndpoint`, `global.postgresql.auth.username`).

## See also

- [In-cluster Database Backup & Restore — How It Works (mechanics & RPO)](./in-cluster-database-backup-and-restore.md)
- [Runbook: PostgreSQL Major Upgrade (in-cluster)](./postgres-major-upgrade-runbook.md)
- [How the in-cluster major upgrade works](./postgres-major-upgrade-mechanism.md)
- [How to migrate the in-cluster database to a managed / cloud database](./migration/in-cluster-postgres-to-managed-db.md)
