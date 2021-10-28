# storage-api

![Version: 1.1.0-alpha.0](https://img.shields.io/badge/Version-1.1.0--alpha.0-informational?style=flat-square)

A Helm chart for Kubernetes

## Requirements

Kubernetes: `>= 1.14.0-0`

| Repository | Name | Version |
|------------|------|---------|
| https://helm.min.io | minio | 7.1.2 |

## Values

> more minio related configuration option can be found at: https://github.com/minio/charts

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