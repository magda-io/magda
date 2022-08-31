# magda-postgres

![Version: 2.0.1](https://img.shields.io/badge/Version-2.0.1-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square)

A helm wrapper chart that provides in-kubernetes postgreSQL for Magda.

This chart runs the in-k8s postgreSQL instance using [bitnami postgreSQL Helm Chart](https://github.com/bitnami/charts/tree/master/bitnami/postgresql).

The docker image used by the chart is built from [bitnami postgreSQL Docker Image](https://github.com/bitnami/bitnami-docker-postgresql) with postgreSQL backup utility [wal-g](https://github.com/wal-g/wal-g) included.

`wal-g` is used for [Continuous Archive Backup & Point-in-Time Recovery (PITR)](https://www.postgresql.org/docs/13/continuous-archiving.html).

## Requirements

Kubernetes: `>= 1.14.0-0`

| Repository | Name | Version |
|------------|------|---------|
| https://raw.githubusercontent.com/bitnami/charts/pre-2022/bitnami | postgresql | 10.9.1 |

## Values

More config postgreSQL related options, please refer to: https://github.com/bitnami/charts/tree/master/bitnami/postgresql

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| backupRestore.backup.archiveTimeout | int | `600` | archive timeout setting. See: https://www.postgresql.org/docs/13/runtime-config-wal.html#GUC-ARCHIVE-TIMEOUT This setting guarantees there would be at least one WAL segment file generated (Thus, avaiable for backup) within the time frame. Lower this value will bloat your archive storage but will reduce the max. time window of data loss when you need to recover from the WAL achieve backup. Default value is 600 seconds (10 mins) |
| backupRestore.backup.enabled | bool | `false` | whether backup feature should be turn on. The change of this field (and all other fields in backupRestore section) will take effect after restart the database pod. |
| backupRestore.backup.jobResourceConfig | object | `{}` | resource config for the pod container that runs backup jobs. e.g.: <br/> jobResourceConfig: <br/> &nbsp;&nbsp;requests: <br/> &nbsp;&nbsp;&nbsp;&nbsp;memory: "64Mi" <br/> &nbsp;&nbsp;&nbsp;&nbsp;cpu: "250m" <br/> |
| backupRestore.backup.numberOfBackupToRetain | int | `7` | old backup will be removed every time when a new backup has been created. the backup removal is done via [wal-g delete](https://github.com/wal-g/wal-g/blob/master/docs/README.md#delete) This option specify the number of most recent backups to retain during the backup removal |
| backupRestore.backup.schedule | string | `"0 15 * * 6"` | schedule (in Cron Syntax) to perform [base backup](https://www.postgresql.org/docs/current/continuous-archiving.html). default to every Saturday 15:00PM UTC time (Sydney Time 1:00AM Sunday). The base backup is produced using [wal-g](https://github.com/wal-g/wal-g) via [base backup protocol](https://www.postgresql.org/docs/current/app-pgbasebackup.html) remotely. |
| backupRestore.backup.walLevel | string | `"replica"` | See: https://www.postgresql.org/docs/13/runtime-config-wal.html#GUC-WAL-LEVEL You shouldn't change this option unless for special reason. |
| backupRestore.backup.walgTarSizeThreshold | string | `"21474836480"` | To configure the size of one backup bundle (in bytes). See info of WALG_TAR_SIZE_THRESHOLD config option on [this page](https://github.com/wal-g/wal-g/blob/master/docs/PostgreSQL.md) Due to [this issue](https://github.com/wal-g/wal-g/issues/1106), we set default value to 21474836480 (20G) to avoid oversize issue. Users can set this setting to a bigger value if needs to create backup with bigger tablespace. |
| backupRestore.image.name | string | `"magda-wal-g"` | wal-g docker image name |
| backupRestore.image.pullPolicy | string | `"IfNotPresent"` | wal-g docker image pull policy |
| backupRestore.image.repository | string | `"docker.io/data61"` | wal-g docker image repo |
| backupRestore.image.tag | string | `"1.1.0"` | wal-g docker image tag |
| backupRestore.recoveryMode.baseBackupName | string | `"LATEST"` | the name of the base backup that will be used for restoring database.  By default, the latest base backup will be used.  If the latest base backup doesn't, you might want to list all available base backups in the target storage and pick an alternative base backup. e.g. "base_000000020000000000000052". |
| backupRestore.recoveryMode.enabled | bool | `false` | Whether run the DB in the receovery mode. When correct config is in place, recovery script will run (using [wal-g](https://github.com/wal-g/wal-g)) to restore DB using previous backup. The change of this field (and all other fields in backupRestore section) will take effect after restart the database pod. |
| backupRestore.storageConfig | object | `{}` | Storage config for backup & restore. All supported storage and available storage config options can be found from [here](https://github.com/wal-g/wal-g/blob/master/docs/STORAGES.md). e.g.  ```  storageConfig:   WALG_S3_PREFIX: "s3://bucket/path/to/folder" ``` Secrets (e.g. `AWS_SECRET_ACCESS_KEY`) can be either set here or set in a manually created secret. When use secret to storage secret, it's required to: <ul> <li>Set `.Values.backupRestore.storageSecretName` to the name of the secret contains all secret values for your storage option.</li> <li>   Mount the secret in a volume for DB pod (mount to path `/etc/wal-g.d/env`) by add an additional entry to `.Values.postgresql.primary.extraVolumes` & `.Values.postgresql.primary.extraVolumeMounts`.  </li> </ul> |
| backupRestore.storageSecretName | string | `""` | For usage of this config option. Please see description of field `storageConfig`. |
| config | object | `{}` | any postgreSQL config options here have highest priority and will override any existing config option values. Be sure you understand the impact of any values set as they might override the values required for other helm chart options. More details please see here: extended-config-configmap.yaml template |
| envVars | object | `{"WALG_PREFETCH_DIR":"/wal-g/prefetch"}` | any extra env vars that will be avialable in DB pod. |
| envVars.WALG_PREFETCH_DIR | string | `"/wal-g/prefetch"` | we move wal-g prefetch location outside PGDATA to avoid pg_rewind issue in postgresql 13. See: https://github.com/wal-g/wal-g/blob/master/docs/PostgreSQL.md |
| global.postgresql.autoCreateSecret | bool | `true` | Whether auto create password secret. More see `magda-core` chart document |
| global.postgresql.existingSecret | string | `"db-main-account-secret"` | see `magda-core` chart document |
| global.postgresql.postgresqlDatabase | string | `"postgres"` | Default database name to be created. At the moment, its value must be `postgres`. |
| global.postgresql.postgresqlUsername | string | `"postgres"` | PostgreSQL username The created user will have superuser privileges if username is postgres For in k8s PostgreSQL, we should use `postgres` so it has privileges for DB schema migrators to run |
| postgresql.customLivenessProbe | string | `"exec:\n  command:\n    - /bin/sh\n    - -c\n    - |\n      if [ -f /wal-g/base-backup.fetching ]\n      then \n      exit 0\n      fi\n    {{- if (include \"postgresql.database\" .) }}\n      exec pg_isready -U {{ include \"postgresql.username\" . | quote }} -d \"dbname={{ include \"postgresql.database\" . }} {{- if and .Values.tls.enabled .Values.tls.certCAFilename }} sslcert={{ include \"postgresql.tlsCert\" . }} sslkey={{ include \"postgresql.tlsCertKey\" . }}{{- end }}\" -h 127.0.0.1 -p {{ template \"postgresql.port\" . }}\n    {{- else }}\n      exec pg_isready -U {{ include \"postgresql.username\" . | quote }} {{- if and .Values.tls.enabled .Values.tls.certCAFilename }} -d \"sslcert={{ include \"postgresql.tlsCert\" . }} sslkey={{ include \"postgresql.tlsCertKey\" . }}\"{{- end }} -h 127.0.0.1 -p {{ template \"postgresql.port\" . }}\n    {{- end }}\ninitialDelaySeconds: {{ .Values.livenessProbe.initialDelaySeconds }}\nperiodSeconds: {{ .Values.livenessProbe.periodSeconds }}\ntimeoutSeconds: {{ .Values.livenessProbe.timeoutSeconds }}\nsuccessThreshold: {{ .Values.livenessProbe.successThreshold }}\nfailureThreshold: {{ .Values.livenessProbe.failureThreshold }}\n"` | Custom Liveness Probe for postgresql. when in recovery mode, only check whether `$PGDATA/recovery.signal` exists. |
| postgresql.customReadinessProbe | string | `"exec:\n  command:\n    - /bin/sh\n    - -c\n    - -e\n    - |\n      if [ -f /wal-g/base-backup.fetching ]\n      then \n      exit 0\n      fi\n    {{- if (include \"postgresql.database\" .) }}\n      exec pg_isready -U {{ include \"postgresql.username\" . | quote }} -d \"dbname={{ include \"postgresql.database\" . }} {{- if .Values.tls.enabled }} sslcert={{ include \"postgresql.tlsCert\" . }} sslkey={{ include \"postgresql.tlsCertKey\" . }}{{- end }}\" -h 127.0.0.1 -p {{ template \"postgresql.port\" . }}\n    {{- else }}\n      exec pg_isready -U {{ include \"postgresql.username\" . | quote }} {{- if .Values.tls.enabled }} -d \"sslcert={{ include \"postgresql.tlsCert\" . }} sslkey={{ include \"postgresql.tlsCertKey\" . }}\"{{- end }} -h 127.0.0.1 -p {{ template \"postgresql.port\" . }}\n    {{- end }}\n    {{- if contains \"bitnami/\" .Values.image.repository }}\n      [ -f /opt/bitnami/postgresql/tmp/.initialized ] || [ -f /bitnami/postgresql/.initialized ]\n    {{- end }}\ninitialDelaySeconds: {{ .Values.readinessProbe.initialDelaySeconds }}\nperiodSeconds: {{ .Values.readinessProbe.periodSeconds }}\ntimeoutSeconds: {{ .Values.readinessProbe.timeoutSeconds }}\nsuccessThreshold: {{ .Values.readinessProbe.successThreshold }}\nfailureThreshold: {{ .Values.readinessProbe.failureThreshold }}\n"` | Custom Readiness Probe for postgresql. when in recovery mode, only check whether `$PGDATA/recovery.signal` exists. |
| postgresql.extendedConfConfigMap | string | `"{{ .Values.fullnameOverride }}-extended-config"` | the name of config map contains entended postgresql config options. You should not change this value as this configMap is auto-generated. If you want to override the postgresql conf option, you should add options to `.Values.config` field of `magda-postgres` chart. Please note: For this field, you can use template string e.g. "{{ .Values.fullnameOverride }}" to reference any values passed to subchat `postgresql`. See more: https://helm.sh/docs/howto/charts_tips_and_tricks/#using-the-tpl-function |
| postgresql.extraEnvVarsCM | string | `"{{ .Values.fullnameOverride }}-extra-env-vars"` | the name of config map contains extra env vars for postgresql pod. You should not change this value as this configMap is auto-generated. If you want to add extra env vars, you should add vars to `.Values.envVars` field of `magda-postgres` chart. Please note: For this field, you can use template string e.g. "{{ .Values.fullnameOverride }}" to reference any values passed to subchat `postgresql`. See more: https://helm.sh/docs/howto/charts_tips_and_tricks/#using-the-tpl-function |
| postgresql.fullnameOverride | string | `"default-db-postgresql"` | Set `fullnameOverride` & `nameOverride` to fixed value so it's easier to manage the naming pattern. And point k8s service to DB instance. |
| postgresql.image.repository | string | `"data61/magda-postgres"` |  |
| postgresql.image.tag | string | `"2.0.1"` | the default docker image tag/version used by the postgresql chart.  When dump the magda version using `yarn set-version` (at magda repo root), this default version will be auto-replaced with the new chart version number. |
| postgresql.livenessProbe.enabled | bool | `false` | `customLivenessProbe` will only be used when `enabled`=`false` Otherwise, default livenessProbe will be used. |
| postgresql.nameOverride | string | `"default-db-postgresql"` | Set `fullnameOverride` & `nameOverride` to fixed value so it's easier to manage the naming pattern. And point k8s service to DB instance. |
| postgresql.persistence.size | string | `"50Gi"` | set the persistence volume size of the postgresql statefulset |
| postgresql.primary.extraVolumeMounts | list | `[]` | extra volume mount can be set here.  e.g. mount backup storage config secret and map as files in /etc/wal-g.d/env |
| postgresql.primary.extraVolumes | list | `[]` | extra volumes can be set here.  e.g. map backup storage config secret as files in /etc/wal-g.d/env |
| postgresql.primary.priorityClassName | string | `""` |  |
| postgresql.readinessProbe.enabled | bool | `false` | `customReadinessProbe` will only be used when `enabled`=`false` Otherwise, default livenessProbe will be used. |
| postgresql.resources | object | `{"requests":{"cpu":"200m","memory":"500Mi"}}` | Set the resource config for the postgresql container |

