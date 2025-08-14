# search-api

![Version: 5.4.0](https://img.shields.io/badge/Version-5.4.0-informational?style=flat-square)

A Helm chart for Kubernetes

## Requirements

Kubernetes: `>= 1.14.0-0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| appConfig | object | `{"authApi":{"baseUrl":"http://authorization-api"},"elasticSearch":{"serverUrl":"http://opensearch:9200"},"embeddingApi":{"baseUrl":"http://magda-embedding-api"},"http":{"port":6102},"printFullConfig":false}` | application config. Allow to configure any application config fields. For all available configuration fields and their default values, please refer to [application.conf](https://github.com/magda-io/magda/blob/main/magda-search-api/src/main/resources/application.conf) and [common.conf](https://github.com/magda-io/magda/blob/main/magda-scala-common/src/main/resources/common.conf) (e.g. for Hybrid search related config) This config field is available since v2.2.5 Although can be set via `.Values.appConfig` as well, the following config fields will override the config set via `.Values.appConfig`: `.Values.debug`, `.Values.datasetsIndexVersion`, `.Values.regionsIndexVersion`, `.Values.publishersIndexVersion`, `.Values.formatsIndexVersion`, |
| appConfig.printFullConfig | bool | `false` | whether print out full config data at application starting up for debug purpose only |
| autoPing.enable | bool | `true` | Whether turn on the cronjob to auto ping search api. see https://github.com/magda-io/magda/issues/3576 for more details |
| autoPing.schedule | string | "*/9 * * * *": run every 9 mins | auto ping cronjob schedule string. specified using unix-cron format (in UTC timezone by default). |
| autoPingJobImage.name | string | `"node"` |  |
| autoPingJobImage.pullPolicy | string | `"IfNotPresent"` |  |
| autoPingJobImage.pullSecrets | bool | `false` |  |
| autoPingJobImage.repository | string | `"docker.io"` |  |
| autoPingJobImage.tag | string | `"18-alpine"` |  |
| autoscaler.enabled | bool | `false` |  |
| autoscaler.maxReplicas | int | `3` |  |
| autoscaler.minReplicas | int | `1` |  |
| autoscaler.targetCPUUtilizationPercentage | int | `80` |  |
| datasetsIndexVersion | string | `nil` | Manually set dataset index version. If not specify, default version will be used. you want to manually set this setting when upgrade to a Magda version that involves dataset index version changes. As it takes time to rebuild the index, you could use this setting to make search API query existing old version index before the new version index is built. |
| debug | bool | `false` | when set to true, search API will print verbose debug info (e.g. ES DSL query) to log |
| defaultImage.pullPolicy | string | `"IfNotPresent"` |  |
| defaultImage.pullSecrets | bool | `false` |  |
| defaultImage.repository | string | `"ghcr.io/magda-io"` |  |
| formatsIndexVersion | string | `nil` | Manually set format index version. If not specify, default version will be used. you want to manually set this setting when upgrade to a Magda version that involves region index version changes. As it takes time to rebuild the index, you could use this setting to make search API query existing old version index before the new version index is built. |
| image.name | string | `"magda-search-api"` |  |
| jvmInitialHeapSize | string | `nil` | Sets the initial size of the heap (via flag `-Xms`) when the JVM starts For production, should probably set to same as `jvmMaxHeapSize` for more predictable performance.  By default, will use JVM default value. value should be in format of `1g` or `200m` etc. |
| jvmInitialRamPercentage | float | `nil` | JVM initial heap memory percentage This value will only be used if `jvmInitialHeapSize` is not set. By default, will use JVM default value. |
| jvmMaxHeapSize | string | `"1g"` | Sets the maximum amount of memory that the JVM heap (via flag `-Xmx`) can grow to. You can set `jvmInitialHeapSize` to the same value for production use case to avoid JVM heap resizing. Should make sure leave enough room for non-heap overhead to avoid OOM. e.g. if you set `resources.limits.memory` (Pod Memory) to 256 MiB, you should set this value to 128 MiB to leave 128 MiB for non-heap overhead to avoid OOM. - For Pod memory 512 MiB, we should set this value to 256 MiB. - 768 MiB Pod memory, should set this value to 512 MiB. - Over 1GiB Pod memory, can reserve 60-70% to heap. value should be in format of `1g` or `200m` etc. |
| jvmMaxRamPercentage | float | `70` | JVM max allowed heap memory percentage based on `resources.limits.memory` This value will only be used if `jvmMaxHeapSize` is not set. For small pods (e.g. under 1 GiB - specified by the `resources.limits.memory`), better to use `jvmMaxHeapSize` to make sure leave enough room for non-heap overhead to avoid OOM. |
| jvmMinRamPercentage | float | `nil` | JVM min heap memory percentage This value will only be used if `jvmInitialHeapSize` is not set. If the InitialRAMPercentage result is less than MinRAMPercentage, the JVM increases it to match MinRAMPercentage. By default, will use JVM default value. |
| jvmPrintFlagsFinal | bool | `false` | whether to print out JVM flags at application starting up This is useful for debugging purpose, e.g. to check if the JVM heap size is set correctly from printed values like InitialHeapSize and MaxHeapSize. |
| livenessProbe.failureThreshold | int | `10` |  |
| livenessProbe.httpGet.path | string | `"/v0/status/live"` |  |
| livenessProbe.httpGet.port | int | `6102` |  |
| livenessProbe.initialDelaySeconds | int | `10` |  |
| livenessProbe.periodSeconds | int | `20` |  |
| livenessProbe.successThreshold | int | `1` |  |
| livenessProbe.timeoutSeconds | int | `5` |  |
| publishersIndexVersion | string | `nil` | Manually set publisher index version. If not specify, default version will be used. you want to manually set this setting when upgrade to a Magda version that involves region index version changes. As it takes time to rebuild the index, you could use this setting to make search API query existing old version index before the new version index is built. |
| readinessProbe.failureThreshold | int | `10` |  |
| readinessProbe.httpGet.path | string | `"/v0/status/ready"` |  |
| readinessProbe.httpGet.port | int | `6102` |  |
| readinessProbe.initialDelaySeconds | int | `10` |  |
| readinessProbe.periodSeconds | int | `20` |  |
| readinessProbe.successThreshold | int | `1` |  |
| readinessProbe.timeoutSeconds | int | `10` |  |
| regionsIndexVersion | string | `nil` | Manually set region index version. If not specify, default version will be used. you want to manually set this setting when upgrade to a Magda version that involves region index version changes. As it takes time to rebuild the index, you could use this setting to make search API query existing old version index before the new version index is built. |
| resources.limits.memory | string | `"1.5Gi"` |  |
| resources.requests.cpu | string | `"50m"` |  |
| resources.requests.memory | string | `"300Mi"` |  |

----------------------------------------------
Autogenerated from chart metadata using [helm-docs v1.13.1](https://github.com/norwoodj/helm-docs/releases/v1.13.1)
