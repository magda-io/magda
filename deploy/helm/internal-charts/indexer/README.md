# indexer

![Version: 6.0.0-alpha.7](https://img.shields.io/badge/Version-6.0.0--alpha.7-informational?style=flat-square)

A Helm chart for Magda's Indexer service.

The default config will pull region mapping files from [the `magda-region-mappings` repo release download area](https://github.com/magda-io/magda-regions/releases).

For production deployment, you might want to host those region mapping files yourself in a more reliable way (e.g. put into a storage bucket).

To config region mapping files, please refer to the this repo: https://github.com/magda-io/magda-regions

## Requirements

Kubernetes: `>= 1.21.0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| appConfig | object | `{"akka":{"http":{"server":{"idle-timeout":"120s","request-timeout":"90s"}}},"authApi":{"baseUrl":"http://authorization-api"},"elasticSearch":{"indices":{"datasets":{"hybridSearch":{"knnVectorFieldConfig":{"compressionLevel":null,"dimension":768,"efConstruction":100,"efSearch":100,"encoder":{"clip":false,"name":"sq","type":"fp16"},"m":16,"mode":"in_memory","spaceType":"l2"},"minScore":0.5}}},"replicas":0,"serverUrl":"http://opensearch:9200","shards":1},"embeddingApi":{"baseUrl":"http://magda-embedding-api"},"http":{"port":6103},"indexer":{"makeSnapshots":false,"readSnapshots":false},"printFullConfig":false,"regionLoader":{"fileProcessingParallelism":1},"registry":{"baseUrl":"http://registry-api","readOnlyBaseUrl":"http://registry-api-read-only","webhookUrl":"http://indexer/v0/registry-hook"}}` | application config. Allow to configure any application config fields. For all available configuration fields and their default values, please refer to [application.conf](https://github.com/magda-io/magda/blob/main/magda-indexer/src/main/resources/application.conf) and [common.conf](https://github.com/magda-io/magda/blob/main/magda-scala-common/src/main/resources/common.conf) (e.g. for Hybrid search related config) This config field is available since v2.2.5 Previous versions' obsolete are still supported for backward compatible reason |
| appConfig.akka.http.server.idle-timeout | string | `"120s"` | The time after which an idle connection will be automatically closed. Set to `infinite` to completely disable idle connection timeouts. |
| appConfig.akka.http.server.request-timeout | string | `"90s"` | Defines the default time period within which the application has to produce an HttpResponse for any given HttpRequest it received. The timeout begins to run when the *end* of the request has been received, so even potentially long uploads can have a short timeout. Set to `infinite` to completely disable request timeout checking.  Make sure this timeout is smaller than the idle-timeout, otherwise, the idle-timeout will kick in first and reset the TCP connection without a response.  If this setting is not `infinite` the HTTP server layer attaches a `Timeout-Access` header to the request, which enables programmatic customization of the timeout period and timeout response for each request individually. |
| appConfig.elasticSearch.indices.datasets.hybridSearch.knnVectorFieldConfig.compressionLevel | string | `nil` | The compression_level mapping parameter selects a quantization encoder that reduces vector memory consumption by the given factor. Support: 1x (all), 2x/8x/16x/32x (faiss), 4x (lucene) If set, encoder will be ignored. |
| appConfig.elasticSearch.indices.datasets.hybridSearch.knnVectorFieldConfig.dimension | int | `768` | Dimension of the embedding vectors. |
| appConfig.elasticSearch.indices.datasets.hybridSearch.knnVectorFieldConfig.efConstruction | int | `100` | Similar to efSearch but used during index construction. Higher values improve search quality but increase index build time. |
| appConfig.elasticSearch.indices.datasets.hybridSearch.knnVectorFieldConfig.efSearch | int | `100` | The size of the candidate queue during search. Larger values may improve search quality but increase search latency. |
| appConfig.elasticSearch.indices.datasets.hybridSearch.knnVectorFieldConfig.encoder | object | `{"clip":false,"name":"sq","type":"fp16"}` | FAISS Encoder configuration (If compressionLevel is set, encoder will be ignored). |
| appConfig.elasticSearch.indices.datasets.hybridSearch.knnVectorFieldConfig.m | int | `16` | The maximum number of graph edges per vector. Higher values increase memory usage but may improve search quality. |
| appConfig.elasticSearch.indices.datasets.hybridSearch.knnVectorFieldConfig.mode | string | `"in_memory"` | Vector workload mode: `on_disk` or `in_memory`. |
| appConfig.elasticSearch.indices.datasets.hybridSearch.minScore | float | `0.5` | by default, use `minScore` to filter out irrelevant result. Can also support standard approximate top-k searches by setting `k = 200` Or maxDistance only one of `minScore`, `maxDistance` or `k` should be set and will be used The config will be applied by the following logic: when `k` is specified, `minScore` & `maxDistance` will be ignored. Otherwise, when `maxDistance` is specified, `minScore` will be ignored. when mode = "on_disk", `k` must be specified for Radial search is not supported for indices which have quantization enabled |
| appConfig.printFullConfig | bool | `false` | whether print out full config data at application starting up for debug purpose only |
| appConfig.regionLoader.fileProcessingParallelism | int | `1` | how many region source file (supplied via config) are allowed to be processed in parallel. Higher number will make the initial region indexing task complete faster but require much more memory. |
| autoReIndex.enable | bool | `true` | Whether turn on the cronjob to trigger reindex. `publisher` & `format` indices might contains obsolete records which require the triming / reindex process to be removed. |
| autoReIndex.schedule | string | "0 15 * * 0": 15:00PM UTC timezone (1:00AM in AEST Sydney timezone) on every Sunday | auto reindex cronjob schedule string. specified using unix-cron format (in UTC timezone by default). |
| defaultImage.pullPolicy | string | `"IfNotPresent"` |  |
| defaultImage.pullSecrets | bool | `false` |  |
| defaultImage.repository | string | `"ghcr.io/magda-io"` |  |
| elasticsearch.useGcsSnapshots | bool | `false` |  |
| image.name | string | `"magda-indexer"` |  |
| jvmInitialHeapSize | string | `nil` | Sets the initial size of the heap (via flag `-Xms`) when the JVM starts For production, should probably set to same as `jvmMaxHeapSize` for more predictable performance.  By default, will use JVM default value. value should be in format of `1g` or `200m` etc. |
| jvmInitialRamPercentage | float | `nil` | JVM initial heap memory percentage This value will only be used if `jvmInitialHeapSize` is not set. By default, will use JVM default value. |
| jvmMaxHeapSize | string | `"1g"` | Sets the maximum amount of memory that the JVM heap (via flag `-Xmx`) can grow to. You can set `jvmInitialHeapSize` to the same value for production use case to avoid JVM heap resizing. Should make sure leave enough room for non-heap overhead to avoid OOM. e.g. if you set `resources.limits.memory` (Pod Memory) to 256 MiB, you should set this value to 128 MiB to leave 128 MiB for non-heap overhead to avoid OOM. - For Pod memory 512 MiB, we should set this value to 256 MiB. - 768 MiB Pod memory, should set this value to 512 MiB. - Over 1GiB Pod memory, can reserve 60-70% to heap. value should be in format of `1g` or `200m` etc. |
| jvmMaxRamPercentage | float | `70` | JVM max allowed heap memory percentage based on `resources.limits.memory` This value will only be used if `jvmMaxHeapSize` is not set. For small pods (e.g. under 1 GiB - specified by the `resources.limits.memory`), better to use `jvmMaxHeapSize` to make sure leave enough room for non-heap overhead to avoid OOM. |
| jvmMinRamPercentage | float | `nil` | JVM min heap memory percentage This value will only be used if `jvmInitialHeapSize` is not set. If the InitialRAMPercentage result is less than MinRAMPercentage, the JVM increases it to match MinRAMPercentage. By default, will use JVM default value. |
| jvmPrintFlagsFinal | bool | `false` | whether to print out JVM flags at application starting up This is useful for debugging purpose, e.g. to check if the JVM heap size is set correctly from printed values like InitialHeapSize and MaxHeapSize. |
| reindexJobImage.name | string | `"node"` |  |
| reindexJobImage.pullPolicy | string | `"IfNotPresent"` |  |
| reindexJobImage.pullSecrets | bool | `false` |  |
| reindexJobImage.repository | string | `"docker.io"` |  |
| reindexJobImage.tag | string | `"18-alpine"` |  |
| resources.limits.cpu | string | `"1200m"` |  |
| resources.limits.memory | string | `"1500Mi"` |  |
| resources.requests.cpu | string | `"100m"` |  |
| resources.requests.memory | string | `"250Mi"` |  |
