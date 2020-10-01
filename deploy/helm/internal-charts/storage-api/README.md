# storage-api

![Version: 0.0.58-terria.0](https://img.shields.io/badge/Version-0.0.58-terria.0-informational?style=flat-square)

A Helm chart for Kubernetes

## Requirements

Kubernetes: `>= 1.14.0-0`

| Repository | Name | Version |
|------------|------|---------|
| https://kubernetes-charts.storage.googleapis.com | minio | 5.0.33 |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| image | object | `{}` |  |
| minio.DeploymentUpdate.type | string | `"Recreate"` |  |
| minio.existingSecret | string | `"storage-secrets"` |  |
| minio.fullnameOverride | string | `"magda-minio"` |  |
| minio.host | string | `"minio"` |  |
| minio.nameOverride | string | `"magda-minio"` |  |
| minio.port | int | `9000` |  |
| minio.resources.requests.memory | string | `"256Mi"` |  |
| resources.limits.cpu | string | `"50m"` |  |
| resources.requests.cpu | string | `"10m"` |  |
| resources.requests.memory | string | `"30Mi"` |  |
