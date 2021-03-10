# storage-api

![Version: 0.0.60-alpha.1](https://img.shields.io/badge/Version-0.0.60--alpha.1-informational?style=flat-square)

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
| image | object | `{}` |  |
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