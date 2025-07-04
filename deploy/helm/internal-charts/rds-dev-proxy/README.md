# rds-dev-proxy

![Version: 5.3.1](https://img.shields.io/badge/Version-5.3.1-informational?style=flat-square)

A RDS proxy for dev / debugging purpose

## Requirements

Kubernetes: `>= 1.14.0-0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| autoscaler.enabled | bool | `false` |  |
| autoscaler.maxReplicas | int | `3` |  |
| autoscaler.minReplicas | int | `1` |  |
| autoscaler.targetCPUUtilizationPercentage | int | `80` |  |
| awsRdsEndpoint | string | `nil` | AWS RDS DB Access Endpoint. e.g. xxxx.xxxx.ap-southeast-2.rds.amazonaws.com |
| global.image | object | `{}` |  |
| global.rollingUpdate | object | `{}` |  |
| image.name | string | `"socat"` |  |
| image.pullPolicy | string | `"IfNotPresent"` |  |
| image.repository | string | `"alpine"` |  |
| image.tag | string | `"1.7.4.1-r0"` |  |
| replicas | string | `nil` | no. of replicas required for the deployment. If not set, k8s will assume `1` but allows HPA (autoscaler) alters it. @default 1 |
| resources.limits.cpu | string | `"50m"` |  |
| resources.requests.cpu | string | `"10m"` |  |
| resources.requests.memory | string | `"30Mi"` |  |

----------------------------------------------
Autogenerated from chart metadata using [helm-docs v1.13.1](https://github.com/norwoodj/helm-docs/releases/v1.13.1)
