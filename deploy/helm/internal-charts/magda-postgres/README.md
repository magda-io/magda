# magda-postgres

![Version: 1.0.0-alpha.0](https://img.shields.io/badge/Version-1.0.0--alpha.0-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square)

A helm wrapper chart that provides in-kubernetes postgreSQL for Magda.

This chart runs the in-k8s postgreSQL instance using [bitnami postgreSQL Helm Chart](https://github.com/bitnami/charts/tree/master/bitnami/postgresql).

The docker image used by the chart is built from [bitnami postgreSQL Docker Image](https://github.com/bitnami/bitnami-docker-postgresql) with postgreSQL backup utility [wal-g](https://github.com/wal-g/wal-g) included.

`wal-g` is used for [Continuous Archive Backup & Point-in-Time Recovery (PITR)](https://www.postgresql.org/docs/13/continuous-archiving.html).

## Requirements

Kubernetes: `>= 1.14.0-0`

| Repository | Name | Version |
|------------|------|---------|
| https://charts.bitnami.com/bitnami | postgresql | 10.9.1 |

## Values

More config postgreSQL related options, please refer to: https://github.com/bitnami/charts/tree/master/bitnami/postgresql

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| backupRestore.backup.enabled | bool | `true` |  |
| backupRestore.image.pullPolicy | string | `"IfNotPresent"` | wal-g docker image pull policy |
| backupRestore.image.repository | string | `"bitnami/wal-g"` | wal-g docker image repo |
| backupRestore.image.tag | string | `"1.1.0-debian-10-r3"` | wal-g docker image tag |
| dbModuleName | string | `"default-db"` | a name used to naming common k8s objects (e.g. backup jobs) of this chart to avoid name conflicts. e.g. combined-db chart might want to set this field to "combined-db" while session-db will want to set this field to "session-db". |
| global.postgresql.autoCreateSecret | bool | `true` | Whether auto create secret for db superuser account password |
| global.postgresql.existingSecret | string | `"db-main-account-secret"` |  |
| global.postgresql.postgresqlDatabase | string | `"postgres"` |  |
| global.postgresql.postgresqlUsername | string | `"postgres"` | PostgreSQL username The created user will have superuser privileges if username is postgres For in k8s PostgreSQL, we should use `postgres` so it has privileges for DB schema migrators to run |
| postgresql.image.repository | string | `"data61/magda-postgres"` |  |
| postgresql.image.tag | string | `"1.0.0-alpha.0"` | the default docker image tag/version used by the postgresql chart.  When dump the magda version using `yarn set-version` (at magda repo root), this default version will be auto-replaced with the new chart version number. |
| postgresql.persistence.size | string | `"50Gi"` |  |
| postgresql.priorityClassName | string | `""` | For dev cluster, we can set it to `magda-9` to controll how combined-db is scheduled. e.g. schedule only on non-preemptible nodes |
| postgresql.resources.requests.cpu | string | `"200m"` |  |
| postgresql.resources.requests.memory | string | `"500Mi"` |  |

