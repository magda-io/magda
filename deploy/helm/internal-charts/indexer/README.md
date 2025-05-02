# indexer

![Version: 5.1.0](https://img.shields.io/badge/Version-5.1.0-informational?style=flat-square)

A Helm chart for Magda's Indexer service.

The default config will pull region mapping files from [the `magda-region-mappings` repo release download area](https://github.com/magda-io/magda-regions/releases).

For production deployment, you might want to host those region mapping files yourself in a more reliable way (e.g. put into a storage bucket).

To config region mapping files, please refer to the this repo: https://github.com/magda-io/magda-regions

## Requirements

Kubernetes: `>= 1.21.0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| appConfig | object | `{"akka":{"http":{"server":{"idle-timeout":"120s","request-timeout":"90s"}}},"authApi":{"baseUrl":"http://authorization-api"},"elasticSearch":{"indices":{"datasets":{"hybridSearch":{"vectorConfig":{"compressionLevel":"32x","dimension":768,"efConstruction":100,"efSearch":100,"encoder":{"clip":false,"name":"sq","type":"fp16"},"m":16,"mode":"on_disk","spaceType":"l2"}}}},"replicas":0,"serverUrl":"http://opensearch:9200","shards":1},"embeddingApi":{"baseUrl":"http://magda-embedding-api"},"http":{"port":6103},"indexer":{"makeSnapshots":false,"readSnapshots":false},"printFullConfig":false,"registry":{"baseUrl":"http://registry-api","readOnlyBaseUrl":"http://registry-api-read-only","webhookUrl":"http://indexer/v0/registry-hook"}}` | application config. Allow to configure any application config fields. For all available configuration fields and their default values, please refer to [application.conf](https://github.com/magda-io/magda/blob/main/magda-indexer/src/main/resources/application.conf) and [common.conf](https://github.com/magda-io/magda/blob/main/magda-scala-common/src/main/resources/common.conf) (e.g. for Hybrid search related config) This config field is available since v2.2.5 Previous versions' obsolete are still supported for backward compatible reason |
| appConfig.akka.http.server.idle-timeout | string | `"120s"` | The time after which an idle connection will be automatically closed. Set to `infinite` to completely disable idle connection timeouts. |
| appConfig.akka.http.server.request-timeout | string | `"90s"` | Defines the default time period within which the application has to produce an HttpResponse for any given HttpRequest it received. The timeout begins to run when the *end* of the request has been received, so even potentially long uploads can have a short timeout. Set to `infinite` to completely disable request timeout checking.  Make sure this timeout is smaller than the idle-timeout, otherwise, the idle-timeout will kick in first and reset the TCP connection without a response.  If this setting is not `infinite` the HTTP server layer attaches a `Timeout-Access` header to the request, which enables programmatic customization of the timeout period and timeout response for each request individually. |
| appConfig.elasticSearch.indices.datasets.hybridSearch.vectorConfig | object | `{"compressionLevel":"32x","dimension":768,"efConstruction":100,"efSearch":100,"encoder":{"clip":false,"name":"sq","type":"fp16"},"m":16,"mode":"on_disk","spaceType":"l2"}` | Configuration for hybrid vector search |
| appConfig.printFullConfig | bool | `false` | whether print out full config data at application starting up for debug purpose only |
| autoReIndex.enable | bool | `true` | Whether turn on the cronjob to trigger reindex. `publisher` & `format` indices might contains obsolete records which require the triming / reindex process to be removed. |
| autoReIndex.schedule | string | "0 15 * * 0": 15:00PM UTC timezone (1:00AM in AEST Sydney timezone) on every Sunday | auto reindex cronjob schedule string. specified using unix-cron format (in UTC timezone by default). |
| defaultImage.pullPolicy | string | `"IfNotPresent"` |  |
| defaultImage.pullSecrets | bool | `false` |  |
| defaultImage.repository | string | `"ghcr.io/magda-io"` |  |
| elasticsearch.useGcsSnapshots | bool | `false` |  |
| image.name | string | `"magda-indexer"` |  |
| jvmMaxRamPercentage | float | `75` | JVM max allowed heap memory percentage based on `resources.limits.memory` |
| reindexJobImage.name | string | `"node"` |  |
| reindexJobImage.pullPolicy | string | `"IfNotPresent"` |  |
| reindexJobImage.pullSecrets | bool | `false` |  |
| reindexJobImage.repository | string | `"docker.io"` |  |
| reindexJobImage.tag | string | `"18-alpine"` |  |
| resources.limits.cpu | string | `"250m"` |  |
| resources.limits.memory | string | `"1100Mi"` |  |
| resources.requests.cpu | string | `"100m"` |  |
| resources.requests.memory | string | `"250Mi"` |  |
