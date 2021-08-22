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
| backupRestore.backup.archiveTimeout | int | `60` |  |
| backupRestore.backup.enabled | bool | `false` |  |
| backupRestore.backup.jobResourceConfig | object | `{}` | resource config for the pod container that runs backup jobs. e.g.: <br/> jobResourceConfig: <br/> &nbsp;&nbsp;requests: <br/> &nbsp;&nbsp;&nbsp;&nbsp;memory: "64Mi" <br/> &nbsp;&nbsp;&nbsp;&nbsp;cpu: "250m" <br/> |
| backupRestore.backup.numberOfBackupToRetain | int | `7` | old backup will be removed every time when a new backup has been created. the backup removal is done via [wal-g delete](https://github.com/wal-g/wal-g/blob/master/docs/README.md#delete) This option specify the number of most recent backups to retain during the backup removal |
| backupRestore.backup.schedule | string | `"15 * * * 6"` | schedule (in Cron Syntax) to perform [base backup](https://www.postgresql.org/docs/current/continuous-archiving.html). default to every Saturday 15:00PM UTC time (Sydney Time 1:00AM Sunday). The base backup is produced using [wal-g](https://github.com/wal-g/wal-g) via [base backup protocol](https://www.postgresql.org/docs/current/app-pgbasebackup.html) remotely. |
| backupRestore.backup.walLevel | string | `"replica"` |  |
| backupRestore.image.pullPolicy | string | `"IfNotPresent"` | wal-g docker image pull policy |
| backupRestore.image.repository | string | `"data61/magda-wal-g"` | wal-g docker image repo |
| backupRestore.image.tag | string | `"1.1.0"` | wal-g docker image tag |
| backupRestore.recoveryMode.baseBackupName | string | `"LATEST"` | the name of the base backup that will be used for restoring database.  |
| backupRestore.recoveryMode.enabled | bool | `false` | Whether run the DB in the receovery mode. When correct config is in place, recovery script will run (using [wal-g](https://github.com/wal-g/wal-g)) to restore DB using previous backup. |
| backupRestore.storageConfig | object | `{}` | Storage config for backup & restore. All supported storage and available storage config options can be found from [here](https://github.com/wal-g/wal-g/blob/master/docs/STORAGES.md). e.g.  ```  storageConfig:   WALG_S3_PREFIX: "s3://bucket/path/to/folder" ``` Secrets (e.g. `AWS_SECRET_ACCESS_KEY`) can be either set here or set in a manually created secret. When use secret to storage secret, it's required to: <ul> <li>Set `.Values.backupRestore.storageSecretName` to the name of the secret contains all secret values for your storage option.</li> <li>   Mount the secret in a volumn for DB pod (mount to path `/etc/wal-g.d/env`) by add an additional entry to `.Values.postgresql.primary.extraVolumes` & `.Values.postgresql.primary.extraVolumeMounts`.  </li> </ul> |
| backupRestore.storageSecretName | string | `""` |  |
| config | object | `{}` | any postgreSQL config options here have highest priority and will override any existing config option values. Be sure you understand the impact of any values set as they might override the values required for other helm chart options. More details please see here: extended-config-configmap.yaml template |
| envVars | object | `{"WALG_PREFETCH_DIR":"/bitnami/postgresql/walg_prefetch"}` | any extra env vars that will be avialable in DB pod. |
| global.postgresql.autoCreateSecret | bool | `true` | Whether auto create password secret. More see `magda-core` chart document |
| global.postgresql.existingSecret | string | `"db-main-account-secret"` | see `magda-core` chart document |
| global.postgresql.postgresqlDatabase | string | `"postgres"` |  |
| global.postgresql.postgresqlUsername | string | `"postgres"` | PostgreSQL username The created user will have superuser privileges if username is postgres For in k8s PostgreSQL, we should use `postgres` so it has privileges for DB schema migrators to run |
| postgresql.customLivenessProbe | string | `"exec:\n  command:\n    - /bin/sh\n    - -c\n    - |\n      if [ -f /wal-g/base-backup.fetching ]\n      then \n      exit 0\n      fi\n    {{- if (include \"postgresql.database\" .) }}\n      exec pg_isready -U {{ include \"postgresql.username\" . | quote }} -d \"dbname={{ include \"postgresql.database\" . }} {{- if and .Values.tls.enabled .Values.tls.certCAFilename }} sslcert={{ include \"postgresql.tlsCert\" . }} sslkey={{ include \"postgresql.tlsCertKey\" . }}{{- end }}\" -h 127.0.0.1 -p {{ template \"postgresql.port\" . }}\n    {{- else }}\n      exec pg_isready -U {{ include \"postgresql.username\" . | quote }} {{- if and .Values.tls.enabled .Values.tls.certCAFilename }} -d \"sslcert={{ include \"postgresql.tlsCert\" . }} sslkey={{ include \"postgresql.tlsCertKey\" . }}\"{{- end }} -h 127.0.0.1 -p {{ template \"postgresql.port\" . }}\n    {{- end }}\ninitialDelaySeconds: {{ .Values.livenessProbe.initialDelaySeconds }}\nperiodSeconds: {{ .Values.livenessProbe.periodSeconds }}\ntimeoutSeconds: {{ .Values.livenessProbe.timeoutSeconds }}\nsuccessThreshold: {{ .Values.livenessProbe.successThreshold }}\nfailureThreshold: {{ .Values.livenessProbe.failureThreshold }}\n"` | Custom Liveness Probe for postgresql. when in recovery mode, only check whether `$PGDATA/recovery.signal` exists. |
| postgresql.customReadinessProbe | string | `"exec:\n  command:\n    - /bin/sh\n    - -c\n    - -e\n    - |\n      if [ -f /wal-g/base-backup.fetching ]\n      then \n      exit 0\n      fi\n    {{- if (include \"postgresql.database\" .) }}\n      exec pg_isready -U {{ include \"postgresql.username\" . | quote }} -d \"dbname={{ include \"postgresql.database\" . }} {{- if .Values.tls.enabled }} sslcert={{ include \"postgresql.tlsCert\" . }} sslkey={{ include \"postgresql.tlsCertKey\" . }}{{- end }}\" -h 127.0.0.1 -p {{ template \"postgresql.port\" . }}\n    {{- else }}\n      exec pg_isready -U {{ include \"postgresql.username\" . | quote }} {{- if .Values.tls.enabled }} -d \"sslcert={{ include \"postgresql.tlsCert\" . }} sslkey={{ include \"postgresql.tlsCertKey\" . }}\"{{- end }} -h 127.0.0.1 -p {{ template \"postgresql.port\" . }}\n    {{- end }}\n    {{- if contains \"bitnami/\" .Values.image.repository }}\n      [ -f /opt/bitnami/postgresql/tmp/.initialized ] || [ -f /bitnami/postgresql/.initialized ]\n    {{- end }}\ninitialDelaySeconds: {{ .Values.readinessProbe.initialDelaySeconds }}\nperiodSeconds: {{ .Values.readinessProbe.periodSeconds }}\ntimeoutSeconds: {{ .Values.readinessProbe.timeoutSeconds }}\nsuccessThreshold: {{ .Values.readinessProbe.successThreshold }}\nfailureThreshold: {{ .Values.readinessProbe.failureThreshold }}\n"` | Custom Readiness Probe for postgresql. when in recovery mode, only check whether `$PGDATA/recovery.signal` exists. |
| postgresql.extendedConfConfigMap | string | `"{{ .Values.fullnameOverride }}-extended-config"` | the name of config map contains entended postgresql config options. You should not change this value as this configMap is auto-generated. If you want to override the postgresql conf option, you should add options to `.Values.config` field of `magda-postgres` chart. Please note: For this field, you can use template string e.g. "{{ .Values.fullnameOverride }}" to reference any values passed to subchat `postgresql`. See more: https://helm.sh/docs/howto/charts_tips_and_tricks/#using-the-tpl-function |
| postgresql.extraEnvVarsCM | string | `"{{ .Values.fullnameOverride }}-extra-env-vars"` | the name of config map contains extra env vars for postgresql pod. You should not change this value as this configMap is auto-generated. If you want to add extra env vars, you should add vars to `.Values.envVars` field of `magda-postgres` chart. Please note: For this field, you can use template string e.g. "{{ .Values.fullnameOverride }}" to reference any values passed to subchat `postgresql`. See more: https://helm.sh/docs/howto/charts_tips_and_tricks/#using-the-tpl-function |
| postgresql.fullnameOverride | string | `"default-db-postgresql"` |  |
| postgresql.image.repository | string | `"data61/magda-postgres"` |  |
| postgresql.image.tag | string | `"1.0.0-alpha.0"` | the default docker image tag/version used by the postgresql chart.  When dump the magda version using `yarn set-version` (at magda repo root), this default version will be auto-replaced with the new chart version number. |
| postgresql.livenessProbe.enabled | bool | `false` | `customLivenessProbe` will only be used when `enabled`=`false` Otherwise, default livenessProbe will be used. |
| postgresql.nameOverride | string | `"default-db-postgresql"` |  |
| postgresql.persistence.size | string | `"50Gi"` |  |
| postgresql.pgHbaConfiguration | string | `"host     all             all        0.0.0.0/0               md5\nhost     all             all        ::/0                    md5\nlocal    all             all                                md5\nhost     all             all        127.0.0.1/32            md5\nhost     all             all        ::1/128                 md5\n# replication keyword allows base backup to be created remotely using wal-g\nhost     replication     all        0.0.0.0/0               md5\n"` | Posgresql host-based authentication config. We added `replication` entry by default in order to enable remotely base backup creation using wal-g |
| postgresql.primary.extraVolumeMounts[0] | object | `{"mountPath":"/bitnami/postgresql/walg_prefetch","name":"magda-walg-prefetch"}` | This volumne mount is used for storing walg prefetch data This has to be outside postgresql data dir to avoid pg13 pg_rewind issue: https://github.com/wal-g/wal-g/blob/master/docs/PostgreSQL.md Please do not remove. |
| postgresql.primary.extraVolumes[0] | object | `{"emptyDir":{},"name":"magda-walg-prefetch"}` | This volumn is used for storing walg prefetch data. Added to avoid pg13 pg_rewind issue: https://github.com/wal-g/wal-g/blob/master/docs/PostgreSQL.md Please do not remove. |
| postgresql.priorityClassName | string | `""` | For dev cluster, we can set it to `magda-9` to controll how combined-db is scheduled. e.g. schedule only on non-preemptible nodes |
| postgresql.readinessProbe.enabled | bool | `false` | `customReadinessProbe` will only be used when `enabled`=`false` Otherwise, default livenessProbe will be used. |
| postgresql.resources.requests.cpu | string | `"200m"` |  |
| postgresql.resources.requests.memory | string | `"500Mi"` |  |

