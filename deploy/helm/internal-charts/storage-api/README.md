# storage-api

![Version: 2.3.0](https://img.shields.io/badge/Version-2.3.0-informational?style=flat-square)

A Helm chart for Kubernetes

## Requirements

Kubernetes: `>= 1.14.0-0`

| Repository | Name | Version |
|------------|------|---------|
| ghcr.io/magda-io/charts | minio | 7.1.2 |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| autoCreateBuckets | bool | `true` | Create `defaultBuckets` on startup. |
| autoCreateSecrets | bool | `true` | Whether or not auto create `storage-secrets`. When auto created, random 20 chars will be generated for `accessKey` and random 40 chars will be generated for `secretKey`. When use minio as gateway mode, you might want to manualy generate the secret in order supply cloud provider secrets. e.g. <ul>   <li>awsAccessKeyId: aws s3 access key id if use AWS s3</li>   <li>awsSecretAccessKey: aws s3 secret access key id if use AWS s3</li>   <li>gcs_key.json: GCS key file if use google GCS</li> </ul> |
| defaultBuckets | list | `[]` | Default buckets to create on startup. If no value is provided `global.defaultDatasetBucket` will be used. |
| defaultImage.pullPolicy | string | `"IfNotPresent"` |  |
| defaultImage.pullSecrets | bool | `false` |  |
| defaultImage.repository | string | `"docker.io/data61"` |  |
| image.name | string | `"magda-storage-api"` |  |
| minio.DeploymentUpdate.type | string | `"Recreate"` |  |
| minio.existingSecret | string | `"storage-secrets"` |  |
| minio.fullnameOverride | string | `"magda-minio"` |  |
| minio.host | string | `"minio"` |  |
| minio.nameOverride | string | `"magda-minio"` |  |
| minio.persistence.size | string | `"10Gi"` |  |
| minio.port | int | `9000` |  |
| minio.resources.requests.memory | string | `"256Mi"` |  |
| minioRegion | string | "unspecified-region" | specify bucket region |
| resources.limits.cpu | string | `"50m"` |  |
| resources.requests.cpu | string | `"10m"` |  |
| resources.requests.memory | string | `"30Mi"` |  |
| skipAuth | bool | `false` | when set to true, API will not query policy engine for auth decision but assume it's always permitted.  It's for debugging only. |

### Use minio as Storage Gateway

By default, the storage api will use minio to create in-cluster storage (Persistent Volumes).

To use minio as cloud storage service gateway while still enjoy the standard s3 compatible API, you can set the Helm chart config as the followings:

#### use AWS S3 as storage target

```yaml
storage-api:
  minioRegion: "xxxxx" # e.g. australia-southeast1
  minio:
    persistence:
      # turn off in-cluster storage
      enabled: false
    s3gateway:
      enabled: true
      replicas: 1
      serviceEndpoint:  ‘xxxxxx’
```

To pass the AWS s3 credential, you need to add keys:
- `awsAccessKeyId`
- `awsSecretAccessKey`

to secret named `storage-secrets`.

#### use Google Cloud Storage (GCS) as storage target

```yaml
storage-api:
  minioRegion: "xxxxx" # e.g. australia-southeast1
  minio:
    persistence:
      # turn off in-cluster storage
      enabled: false
    gcsgateway:
      enabled: true
      # Number of parallel instances
      replicas: 1
      # Google cloud project-id
      projectId: ""
```

To pass the GCS credentials (json file of service account key), you need to add the key `gcs_key.json` to secret named `storage-secrets`.  The content of the ``gcs_key.json` key should be your GCS JSON key file.

#### use azure blob as storage target

```yaml
storage-api:
  minioRegion: "xxxxx"
  # stop auto create `storage-secrets`, as we need to manually create with storage account name & key
  autoCreateSecrets: false
  minio:
    persistence:
      # turn off in-cluster storage
      enabled: false
    azuregateway:
      enabled: true
      # Number of parallel instances
      replicas: 1
```

You also need to manually create secrets `storage-secrets` that contains the following keys:
- `accesskey`: azure storage account name
- `secretkey`: azure storage account key

> more minio related configuration option can be found at: https://github.com/magda-io/minio-charts/tree/5bb5fe5f2c67e69d9b436f95511c3a0252cdb759/minio#configuration