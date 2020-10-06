# magda-core

![Version: 0.0.58-alpha.0](https://img.shields.io/badge/Version-0.0.58--alpha.0-informational?style=flat-square)

A complete solution for managing, publishing and discovering government data, private and open. This chart includes all core magda modules.

**Homepage:** <https://github.com/magda-io/magda>

## Source Code

* <https://github.com/magda-io/magda>

## Requirements

Kubernetes: `>= 1.14.0-0`

| Repository | Name | Version |
|------------|------|---------|
| file://../internal-charts/admin-api | admin-api | 0.0.58-alpha.0 |
| file://../internal-charts/apidocs-server | apidocs-server | 0.0.58-alpha.0 |
| file://../internal-charts/authorization-api | authorization-api | 0.0.58-alpha.0 |
| file://../internal-charts/authorization-db | authorization-db | 0.0.58-alpha.0 |
| file://../internal-charts/cloud-sql-proxy | cloud-sql-proxy | 0.0.58-alpha.0 |
| file://../internal-charts/combined-db | combined-db | 0.0.58-alpha.0 |
| file://../internal-charts/content-api | content-api | 0.0.58-alpha.0 |
| file://../internal-charts/content-db | content-db | 0.0.58-alpha.0 |
| file://../internal-charts/correspondence-api | correspondence-api | 0.0.58-alpha.0 |
| file://../internal-charts/elasticsearch | elasticsearch | 0.0.58-alpha.0 |
| file://../internal-charts/gateway | gateway | 0.0.58-alpha.0 |
| file://../internal-charts/indexer | indexer | 0.0.58-alpha.0 |
| file://../internal-charts/ingress | ingress | 0.0.58-alpha.0 |
| file://../internal-charts/opa | opa | 0.0.58-alpha.0 |
| file://../internal-charts/priorities | priorities | 0.0.58-alpha.0 |
| file://../internal-charts/registry-api | registry-api | 0.0.58-alpha.0 |
| file://../internal-charts/registry-db | registry-db | 0.0.58-alpha.0 |
| file://../internal-charts/search-api-node | search-api-node | 0.0.58-alpha.0 |
| file://../internal-charts/search-api | search-api | 0.0.58-alpha.0 |
| file://../internal-charts/session-db | session-db | 0.0.58-alpha.0 |
| file://../internal-charts/storage-api | storage-api | 0.0.58-alpha.0 |
| file://../internal-charts/tenant-api | tenant-api | 0.0.58-alpha.0 |
| file://../internal-charts/tenant-db | tenant-db | 0.0.58-alpha.0 |
| file://../internal-charts/web-server | web-server | 0.0.58-alpha.0 |
| file://../openfaas | openfaas | 5.5.5-magda |
| https://charts.magda.io | magda-preview-map | 0.0.57-0 |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| global.defaultAdminUserId | string | `"00000000-0000-4000-8000-000000000000"` |  |
| global.enablePriorityClass | bool | `false` |  |
| global.exposeNodePorts | bool | `false` |  |
| global.externalUrl | string | `"http://localhost:6100"` |  |
| global.gapiIds | list | `[]` |  |
| global.image.pullPolicy | string | `"IfNotPresent"` |  |
| global.image.repository | string | `"data61"` |  |
| global.logLevel | string | `"INFO"` |  |
| global.namespace | string | `"default"` |  |
| global.noDbAuth | bool | `false` |  |
| global.openfaas.allowAdminOnly | bool | `true` |  |
| global.openfaas.enabled | bool | `true` |  |
| global.openfaas.functionNamespace | string | `"openfaas-fn"` |  |
| global.openfaas.mainNamespace | string | `"openfaas"` |  |
| global.openfaas.namespacePrefix | string | `""` |  |
| global.rollingUpdate.maxUnavailable | int | `0` |  |
| global.useCloudSql | bool | `false` |  |
| global.useCombinedDb | bool | `true` |  |
| openfaas.basic_auth | bool | `false` |  |
| openfaas.faasIdler.dryRun | bool | `false` |  |
| openfaas.faasnetes.imagePullPolicy | string | `"IfNotPresent"` |  |
| openfaas.faasnetes.readTimeout | string | `"120s"` |  |
| openfaas.faasnetes.writeTimeout | string | `"120s"` |  |
| openfaas.gateway.readTimeout | string | `"125s"` |  |
| openfaas.gateway.scaleFromZero | bool | `true` |  |
| openfaas.gateway.upstreamTimeout | string | `"120s"` |  |
| openfaas.gateway.writeTimeout | string | `"125s"` |  |
| openfaas.ingress.enabled | bool | `false` |  |
| openfaas.operator.create | bool | `true` |  |
| openfaas.serviceType | string | `"ClusterIP"` |  |
| tags.admin-api | bool | `false` |  |
| tags.all | bool | `true` |  |
| tags.apidocs-server | bool | `false` |  |
| tags.authorization-api | bool | `false` |  |
| tags.authorization-db | bool | `false` |  |
| tags.combined-db | bool | `false` |  |
| tags.content-api | bool | `false` |  |
| tags.content-db | bool | `false` |  |
| tags.correspondence-api | bool | `false` |  |
| tags.elasticsearch | bool | `false` |  |
| tags.gateway | bool | `false` |  |
| tags.indexer | bool | `false` |  |
| tags.ingress | bool | `false` |  |
| tags.opa | bool | `false` |  |
| tags.preview-map | bool | `false` |  |
| tags.priorities | bool | `true` |  |
| tags.registry-api | bool | `false` |  |
| tags.registry-db | bool | `false` |  |
| tags.search-api | bool | `false` |  |
| tags.search-api-node | bool | `false` |  |
| tags.session-db | bool | `false` |  |
| tags.storage-api | bool | `false` |  |
| tags.tenant-api | bool | `false` |  |
| tags.tenant-db | bool | `false` |  |
| tags.web-server | bool | `false` |  |

----------------------------------------------
Autogenerated from chart metadata using [helm-docs v1.2.1](https://github.com/norwoodj/helm-docs/releases/v1.2.1)
