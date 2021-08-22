# How to Config Continuous Archiving and Point-in-Time Recovery (PITR)

You can choose use managed postgreSQL database services from cloud providers or Magda's built-in in-k8s dataset instance. If you opt to the in-k8s dataset instance option, you can leverage [PostgreSQL's Continuous Archive Backup feature to achieve Point-in-Time Recovery (PITR)](https://www.postgresql.org/docs/13/continuous-archiving.html). This document explains how to:

- Config Magda to auto-create base backups and turn on continuous archiving backup
- Config Magda to enter the recover from a backup created earlier.

## 1> Helm Chart Config Options

Backup & recover related helm chart config options are available from chart [magda-postgres](../../deploy/helm/internal-charts/magda-postgres).

Config document can be found from [magda-postgres](../../deploy/helm/internal-charts/magda-postgres).

## 2> Config Storage Option

For either backup or recoever, you need to config the storage where the backup data is stored at. We use [wal-g](https://github.com/wal-g/wal-g) handles backup storage. It supports most common storage options (e.g. AWS S3, Google Cloud GCS or Azure Storage).

Full list of supported storage options & configuration information can be found here: https://github.com/wal-g/wal-g/blob/master/docs/STORAGES.md

Here, we take AWS S3 as an example to explain how to config storage option.

By default, all logic databases are available from a single DB instance [combined-db](../../deploy/helm/internal-charts/combined-db). You can config the storage option of [magda-postgres](../../deploy/helm/internal-charts/magda-postgres) chart that is included by `combined-db` as followings:

```yaml
combined-db:
  magda-postgres:
    backupRestore:
      storageConfig:
        # backup location
        WALG_S3_PREFIX: "s3://xxx/xx"
        # AWS S3 Region
        AWS_REGION: "ap-southeast-2"
      # a manually created secret `backup-storage-account` that contains `AWS_ACCESS_KEY_ID` & `AWS_SECRET_ACCESS_KEY`
      storageSecretName: backup-storage-account
    postgresql:
      primary:
        # mount & map secret `backup-storage-account` to `/etc/wal-g.d/env`
        extraVolumes:
          - name: storage-account
            secret:
              secretName: backup-storage-account
        extraVolumeMounts:
          - name: storage-account
            mountPath: /etc/wal-g.d/env
```

- Here, `backup-storage-account` is a manually created secret that contains `AWS_ACCESS_KEY_ID` & `AWS_SECRET_ACCESS_KEY` used to access the s3 bucket. We can use the command similar to the followings to create the secret:

```bash
export AWS_ACCESS_KEY_ID="xxxxxxxxxx"
export AWS_SECRET_ACCESS_KEY="xxxxxxxxxxxx"
kubectl create secret generic backup-storage-account \
 --namespace xxxxx \
 --from-literal=AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
 --from-literal=AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
```

- The secret is required to mount and map as files in `/etc/wal-g.d/env` as all files in `/etc/wal-g.d/env` will be used by tool [envdir](http://cr.yp.to/daemontools/envdir.html) to create environment variables for [wal-g](https://github.com/wal-g/wal-g) when pushing or fetching files.

> You also can add `AWS_ACCESS_KEY_ID` & `AWS_SECRET_ACCESS_KEY` to `combined-db.magda-postgres.backupRestore.storageConfig` as other storage config options. But supply as secret would be a more appropriate way of handling secret information.

### 2.1> Config Storage Option for Google Cloud Storage (GCS)

For GCS, [wal-g](https://github.com/wal-g/wal-g/blob/master/docs/STORAGES.md#gcs) requires an environment variable `GOOGLE_APPLICATION_CREDENTIALS` contains the path to the service account json key file.

This would require a secret in the following layout:

```yaml
apiVersion: v1
kind: Secret
type: Opaque
metadata:
  namespace: xxxxxx
  name: backup-storage-account
data:
  # based64 encoded of GCS json key file content
  gcs.json: xxxxxxxxxxx
  # base64 encoded of GCS json key file path: `/etc/wal-g.d/env/gcs.json`
  GOOGLE_APPLICATION_CREDENTIALS: L2V0Yy93YWwtZy5kL2Vudi9nY3MuanNvbg==
```

You can create the secret with the command:

```bash
kubectl create secret generic backup-storage-account \
 --namespace xxxxx \
 --from-literal=GOOGLE_APPLICATION_CREDENTIALS=/etc/wal-g.d/env/gcs.json \
 --from-file=gcs.json=[path to key file on your local machine]
```

## 3> Continuous Archive Backup

To turn on the backup, you can simply set `combined-db.magda-postgres.backupRestore.backup.enabled`=`true` and set `combined-db.magda-postgres.backupRestore.backup.schedule` to required cron schedule expression. Other backup related config options can be found from [magda-postgres](../../deploy/helm/internal-charts/magda-postgres) chart document.

Here is a complete example with backup turned on:

```yaml
combined-db:
  magda-postgres:
    backupRestore:
      storageConfig:
        # backup location
        WALG_S3_PREFIX: "s3://xxx/xx"
        # AWS S3 Region
        AWS_REGION: "ap-southeast-2"
      # a manually created secret `backup-storage-account` that contains `AWS_ACCESS_KEY_ID` & `AWS_SECRET_ACCESS_KEY`
      storageSecretName: backup-storage-account
      backup:
        enabled: true
        # Please note: k8s cron schdule always refer to UCT timezone
        schedule: "20 12 * * *"
        # Keep 6 most recent base backups and auto-delete older ones
        # default: 7
        numberOfBackupToRetain: 6
    postgresql:
      primary:
        # mount & map secret `backup-storage-account` to `/etc/wal-g.d/env`
        extraVolumes:
          - name: storage-account
            secret:
              secretName: backup-storage-account
        extraVolumeMounts:
          - name: storage-account
            mountPath: /etc/wal-g.d/env
```

Once the backup is turn on, base backup will created by the schedule defined by the config and write ahead log (WAL) based continuous archives will also be pushed to the same storage location when a segment is ready on the postgreSQL instance.

## 4> Point-in-Time Recovery (PITR)

To recovery from a backup, you can simply set `combined-db.magda-postgres.backupRestore.backup.recoveryMode.enabled`=`true`. Other backup related config options can be found from [magda-postgres](../../deploy/helm/internal-charts/magda-postgres) chart document.

Here is a complete example with recovery mode turned on:

```yaml
combined-db:
  magda-postgres:
    backupRestore:
      storageConfig:
        # backup location
        WALG_S3_PREFIX: "s3://xxx/xx"
        # AWS S3 Region
        AWS_REGION: "ap-southeast-2"
      # a manually created secret `backup-storage-account` that contains `AWS_ACCESS_KEY_ID` & `AWS_SECRET_ACCESS_KEY`
      storageSecretName: backup-storage-account
      recoveryMode:
        enabled: true
    postgresql:
      primary:
        # mount & map secret `backup-storage-account` to `/etc/wal-g.d/env`
        extraVolumes:
          - name: storage-account
            secret:
              secretName: backup-storage-account
        extraVolumeMounts:
          - name: storage-account
            mountPath: /etc/wal-g.d/env
```

> Please note, you can also manually turn on the recovery mode by manually edit the relevant postgreSQL instance statefulset and set environment variable `MAGDA_RECOVERY_MODE`=`true`.

By default, it will recover with the "LATEST" base backup. However, you can specify a different backup name with helm config option: `combined-db.magda-postgres.backupRestore.backup.recoveryMode.baseBackupName` or manually set environment variable `MAGDA_RECOVERY_BASE_BACKUP_NAME` on the relevant postgreSQL instance statefulset.

More info can also be found from [wal-g backup fetch document](https://github.com/wal-g/wal-g/blob/master/docs/PostgreSQL.md#backup-fetch).

## 5> Backward Compatibility

Since Magda version 1.0.0, we switch to [wal-g](https://github.com/wal-g) for handling postgreSQL backup & recovery. Before `wal-g`, we used [wal-e](https://github.com/wal-e/wal-e).

Although `wal-g` create base backups in a slight different structure & format which is not compatibile with `wal-e`, `wal-g` can handle backups previously created with `wal-e`.

> Please note: If you attempt to recover from a `wal-e` backup that is stored on Google Cloud Storage (GCS), you will need to set environment variable `GCS_NORMALIZE_PREFIX`=`false` (via `combined-db.magda-postgres.backupRestore.storageConfig` config option). It's becasue `wal-e` might create double slashes `//` when store your backup (i.e. your actually GCS prefix might be `gs://xxx//xx`). See [here](https://github.com/wal-g/wal-g/blob/master/docs/STORAGES.md#gcs) for more details.
