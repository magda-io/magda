# postgresql-wrapper

![Version: 1.0.0-alpha.0](https://img.shields.io/badge/Version-1.0.0--alpha.0-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square)

A helm wrapper chart that provides in-kubernetes postgreSQL for Magda.

## Requirements

Kubernetes: `>= 1.14.0-0`

| Repository | Name | Version |
|------------|------|---------|
| https://charts.bitnami.com/bitnami | postgresql | 10.9.1 |

## Values

More config postgreSQL related options, please refer to: https://github.com/bitnami/charts/tree/master/bitnami/postgresql

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| global.postgresql.autoCreateSecret | bool | `true` | Whether auto create secret for db superuser account password |
| global.postgresql.existingSecret | string | `"db-main-account-secret"` |  |
| global.postgresql.postgresqlDatabase | string | `"postgres"` |  |
| global.postgresql.postgresqlUsername | string | `"postgres"` | PostgreSQL username The created user will have superuser privileges if username is postgres For in k8s PostgreSQL, we should use `postgres` so it has privileges for DB schema migrators to run |
| postgresql.image.tag | string | `"13.3.0-debian-10-r79"` |  |
| postgresql.persistence.size | string | `"50Gi"` |  |
| postgresql.priorityClassName | string | `""` | For dev cluster, we can set it to `magda-9` to controll how combined-db is scheduled. e.g. schedule only on non-preemptible nodes |
| postgresql.resources.requests.cpu | string | `"200m"` |  |
| postgresql.resources.requests.memory | string | `"500Mi"` |  |

