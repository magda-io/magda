# registry-api

![Version: 5.4.0-alpha.0](https://img.shields.io/badge/Version-5.4.0--alpha.0-informational?style=flat-square)

A Helm chart for Kubernetes

## Requirements

Kubernetes: `>= 1.14.0-0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| appConfig | object | `{"akka":{"http":{"client":{"idle-timeout":"120s"}}},"authApi":{"baseUrl":"http://authorization-api"},"authorization":{"skipOpaQuery":false},"db":{"default":{"url":"jdbc:postgresql://registry-db/postgres"}},"http":{"port":6101},"printFullConfig":false,"scalikejdbc":{"global":{"loggingSQLAndTime":{"enabled":false}}},"validateJsonSchema":true,"webhooks":{"requestStreamTimeout":"120s"}}` | application config. Allow to configure any application config fields. For all available configuration fields and their default values, please refer to [application.conf](https://github.com/magda-io/magda/blob/main/magda-registry-api/src/main/resources/application.conf) This config field is available since v2.2.5 Previous versions supported config fields: `.Values.validateJsonSchema`, `.Values.db.poolInitialSize`, `.Values.db.poolMaxSize` and  `.Values.db.poolConnectionTimeoutMillis` are still supported for backward compatible reason (although deprecated). When exist, values from those obsolete config fields will override relevant fields in `.Values.appConfig`. Obsolete config fields: `.Values.logLevel`, `.Values.skipAuthorization` and `.Values.printSQlInConsole` are not supported anymore. Please config using alternative fields via `.Values.appConfig` instead. |
| appConfig.authorization.skipOpaQuery | bool | `false` | Skip asking authorization decisions from policy engine. `UnconditionalTrueDecision` will be always returned for this case Useful when running locally - DO NOT TURN ON IN PRODUCTION  |
| appConfig.printFullConfig | bool | `false` | whether print out full config data at application starting up for debug purpose only |
| appConfig.scalikejdbc.global.loggingSQLAndTime.enabled | bool | `false` | Whether print all SQL in console. For DEBUG only |
| appConfig.validateJsonSchema | bool | `true` | Whether registry api should validate incoming JSON data |
| appConfig.webhooks.requestStreamTimeout | string | `"120s"` | WebHook event notification request stream processing timeout you might want to increase this value to allow longer processing time for sync webhooks you will also want to adjust `akka.http.client.idle-timeout` to match this value |
| aspectDefinitionMigrator.backoffLimit | int | `6` |  |
| aspectDefinitionMigrator.enabled | bool | `true` |  |
| aspectDefinitionMigrator.image.name | string | `"magda-migrator-registry-aspects"` |  |
| autoscaler.enabled | bool | `false` |  |
| autoscaler.maxReplicas | int | `3` |  |
| autoscaler.minReplicas | int | `1` |  |
| autoscaler.targetCPUUtilizationPercentage | int | `80` |  |
| defaultImage.pullPolicy | string | `"IfNotPresent"` |  |
| defaultImage.pullSecrets | bool | `false` |  |
| defaultImage.repository | string | `"ghcr.io/magda-io"` |  |
| deployments.full | object | `{"idleTimeout":"60s","replicas":1,"requestTimeout":"60s"}` | deployment config for full registry instance. You can also specify different `resources` config under this key. |
| deployments.full.idleTimeout | string | `"60s"` | Default idle timeout for full instance. Make sure `idleTimeout` is longer than `requestTimeout` |
| deployments.full.requestTimeout | string | `"60s"` | Default request timeout for full instance |
| deployments.readOnly | object | `{"enable":false,"idleTimeout":"60s","replicas":1,"requestTimeout":"60s"}` | deployment config for readonly registry instances. You can also specify different `resources` config under this key. |
| deployments.readOnly.idleTimeout | string | `"60s"` | Default idle timeout for readonly instance. Make sure `idleTimeout` is longer than `requestTimeout` |
| deployments.readOnly.replicas | int | `1` | no. of replicates. Its value must no lower than `minReplicas` |
| deployments.readOnly.requestTimeout | string | `"60s"` | Default request timeout for readonly instance |
| global | object | `{}` |  |
| image.name | string | `"magda-registry-api"` |  |
| jvmInitialHeapSize | string | `nil` | Sets the initial size of the heap (via flag `-Xms`) when the JVM starts For production, should probably set to same as `jvmMaxHeapSize` for more predictable performance.  By default, will use JVM default value. value should be in format of `1g` or `200m` etc. |
| jvmInitialRamPercentage | float | `nil` | JVM initial heap memory percentage This value will only be used if `jvmInitialHeapSize` is not set. By default, will use JVM default value. |
| jvmMaxHeapSize | string | `"1g"` | Sets the maximum amount of memory that the JVM heap (via flag `-Xmx`) can grow to. You can set `jvmInitialHeapSize` to the same value for production use case to avoid JVM heap resizing. Should make sure leave enough room for non-heap overhead to avoid OOM. e.g. if you set `resources.limits.memory` (Pod Memory) to 256 MiB, you should set this value to 128 MiB to leave 128 MiB for non-heap overhead to avoid OOM. - For Pod memory 512 MiB, we should set this value to 256 MiB. - 768 MiB Pod memory, should set this value to 512 MiB. - Over 1GiB Pod memory, can reserve 60-70% to heap. value should be in format of `1g` or `200m` etc. |
| jvmMaxRamPercentage | float | `70` | JVM max allowed heap memory percentage based on `resources.limits.memory` This value will only be used if `jvmMaxHeapSize` is not set. For small pods (e.g. under 1 GiB - specified by the `resources.limits.memory`), better to use `jvmMaxHeapSize` to make sure leave enough room for non-heap overhead to avoid OOM. |
| jvmMinRamPercentage | float | `nil` | JVM min heap memory percentage This value will only be used if `jvmInitialHeapSize` is not set. If the InitialRAMPercentage result is less than MinRAMPercentage, the JVM increases it to match MinRAMPercentage. By default, will use JVM default value. |
| jvmPrintFlagsFinal | bool | `false` | whether to print out JVM flags at application starting up This is useful for debugging purpose, e.g. to check if the JVM heap size is set correctly from printed values like InitialHeapSize and MaxHeapSize. |
| livenessProbe | object | `{}` |  |
| resources.limits.memory | string | `"1.5Gi"` |  |
| resources.requests.cpu | string | `"250m"` |  |
| resources.requests.memory | string | `"500Mi"` |  |

----------------------------------------------
Autogenerated from chart metadata using [helm-docs v1.13.1](https://github.com/norwoodj/helm-docs/releases/v1.13.1)
