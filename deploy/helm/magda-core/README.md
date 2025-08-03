# magda-core

![Version: 5.3.1](https://img.shields.io/badge/Version-5.3.1-informational?style=flat-square)

A complete solution for managing, publishing and discovering government data, private and open. This chart includes all core magda modules.

**Homepage:** <https://github.com/magda-io/magda>

## Source Code

* <https://github.com/magda-io/magda>

## Requirements

| Repository | Name | Version |
|------------|------|---------|
| file://../internal-charts/admin-api | admin-api | 5.3.1 |
| file://../internal-charts/apidocs-server | apidocs-server | 5.3.1 |
| file://../internal-charts/authorization-api | authorization-api | 5.3.1 |
| file://../internal-charts/authorization-db | authorization-db | 5.3.1 |
| file://../internal-charts/cloud-sql-proxy | cloud-sql-proxy | 5.3.1 |
| file://../internal-charts/combined-db | combined-db | 5.3.1 |
| file://../internal-charts/content-api | content-api | 5.3.1 |
| file://../internal-charts/content-db | content-db | 5.3.1 |
| file://../internal-charts/correspondence-api | correspondence-api | 5.3.1 |
| file://../internal-charts/elasticsearch | elasticsearch | 5.3.1 |
| file://../internal-charts/gateway | gateway | 5.3.1 |
| file://../internal-charts/indexer | indexer | 5.3.1 |
| file://../internal-charts/ingress | ingress | 5.3.1 |
| file://../internal-charts/opensearch-dashboards | opensearch-dashboards | 5.3.1 |
| file://../internal-charts/opensearch | opensearch | 5.3.1 |
| file://../internal-charts/priorities | priorities | 5.3.1 |
| file://../internal-charts/rds-dev-proxy | rds-dev-proxy | 5.3.1 |
| file://../internal-charts/registry-api | registry-api | 5.3.1 |
| file://../internal-charts/registry-db | registry-db | 5.3.1 |
| file://../internal-charts/search-api-node | search-api-node | 5.3.1 |
| file://../internal-charts/search-api | search-api | 5.3.1 |
| file://../internal-charts/semantic-search-api | semantic-search-api | 5.3.1 |
| file://../internal-charts/session-db | session-db | 5.3.1 |
| file://../internal-charts/storage-api | storage-api | 5.3.1 |
| file://../internal-charts/tenant-api | tenant-api | 5.3.1 |
| file://../internal-charts/tenant-db | tenant-db | 5.3.1 |
| file://../internal-charts/web-server | web-server | 5.3.1 |
| file://../magda-common | magda-common | 5.3.1 |
| oci://ghcr.io/magda-io/charts | magda-embedding-api | 1.1.0 |
| oci://ghcr.io/magda-io/charts | preview-map(magda-preview-map) | 1.1.3 |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| autoCreateAuthSecrets | bool | `true` | Whether or not auto create a k8s secrets named `auth-secrets` that contains: <ul> <li> JWT secret, under key: `jwt-secret`. Used internally by Magda gateway to issue JWT token.</li> <li> Session secret, under key: `session-secret`. Used by Magda gateway for managing session data.</li> </ul> The auto generated secrets will be 32 chars (256bits) long. |
| extraObjects | list | `[]` | Array of extra K8s manifests to deploy Each item in the array can be a valid K8s manifest in yaml or string type. When manifest is in string type, it will be parsed as a template with the root object as the context. Therefore, any values can be referenced in the template string e.g. `{{ .Values.xxxxx }}`. Example: extraObjects: - apiVersion: policy/v1 # This is a manifest item written in YAML   kind: PodDisruptionBudget   metadata:     name: my-pdb   spec:     maxUnavailable: 1     selector:       matchLabels:         app: my-app - |   # This is a manifest item written in template string. `|` is used to preserve the new lines.    apiVersion: v1   kind: PodDisruptionBudget   metadata:     name: my-pdb     labels:        {{- include "magda.common.labels.standard" (dict "root" .) | nindent 4 }}   spec:     maxUnavailable: 1     selector:       matchLabels:         {{- include "magda.common.labels.matchLabels" (dict "root" .) | nindent 6 }} |
| gateway.helmet.contentSecurityPolicy.directives.connectSrc[0] | string | `"'self'"` |  |
| gateway.helmet.contentSecurityPolicy.directives.connectSrc[1] | string | `"https://tiles.magda.io"` |  |
| gateway.helmet.contentSecurityPolicy.directives.imgSrc[0] | string | `"'self'"` |  |
| gateway.helmet.contentSecurityPolicy.directives.imgSrc[1] | string | `"data:"` |  |
| gateway.helmet.contentSecurityPolicy.directives.imgSrc[2] | string | `"https://*.tile.openstreetmap.org"` |  |
| gateway.helmet.contentSecurityPolicy.directives.imgSrc[3] | string | `"https://*.basemaps.cartocdn.com"` |  |
| gateway.helmetPerPath."/assets/alasql.html" | object | `{"contentSecurityPolicy":{"directives":{"scriptSrc":["'self'","'unsafe-eval'"]}}}` | allow alasql to compile SQL query at frontend in its separate window/iframe |
| gateway.helmetPerPath./preview-map/*.contentSecurityPolicy.directives.connectSrc[0] | string | `"'self'"` |  |
| gateway.helmetPerPath./preview-map/*.contentSecurityPolicy.directives.connectSrc[1] | string | `"*.cesium.com"` |  |
| gateway.helmetPerPath./preview-map/*.contentSecurityPolicy.directives.imgSrc[0] | string | `"*"` |  |
| gateway.helmetPerPath./preview-map/*.contentSecurityPolicy.directives.imgSrc[1] | string | `"data:"` |  |
| gateway.helmetPerPath./preview-map/*.contentSecurityPolicy.directives.scriptSrc[0] | string | `"'self'"` |  |
| gateway.helmetPerPath./preview-map/*.contentSecurityPolicy.directives.styleSrc[0] | string | `"'self'"` |  |
| gateway.helmetPerPath./preview-map/*.contentSecurityPolicy.directives.styleSrc[1] | string | `"blob:"` |  |
| gateway.helmetPerPath./preview-map/*.contentSecurityPolicy.directives.styleSrc[2] | string | `"'unsafe-inline'"` |  |
| gateway.helmetPerPath./preview-map/*.contentSecurityPolicy.directives.styleSrc[3] | string | `"fonts.googleapis.com"` |  |
| gateway.helmetPerPath./preview-map/*.contentSecurityPolicy.directives.workerSrc[0] | string | `"'self'"` |  |
| gateway.helmetPerPath./preview-map/*.contentSecurityPolicy.directives.workerSrc[1] | string | `"blob:"` |  |
| global.authPluginAllowedExternalRedirectDomains | list | `[]` | By default, at end of authentication process, an auth plugin will never redirect the user to an external domain,  even if `authPluginRedirectUrl` is configured to an URL with an external domain. Unless an external domain is added to the whitelist i.e. this `authPluginAllowedExternalRedirectDomains` config,  any auth plugins will always ignore the domain part of the url (if supplied) and only redirect the user to the URL path under the current domain. Please note: you add a url host string to this list. e.g. "abc.com:8080" |
| global.authPluginRedirectUrl | string | `"/sign-in-redirect"` | the redirection url after the whole authentication process is completed. Authentication Plugins will use this value as default setting. The following query parameters might be present to supply the authentication result: <ul> <li>result: (string) Compulsory. Possible value: "success" or "failure". </li> <li>errorMessage: (string) Optional. Text message to provide more information on the error to the user. </li> </ul> The default built-in landing "/sign-in-redirect" route supports an additional `redirectTo` query parameter. If this parameter not presents, the user will be redirected further to the frontend route `/account` which is the account page . Otherwise, user will redirected to the url path specified by `redirectTo` query parameter. Please note: `redirectTo` only accept an URL path (e.g. `/a/b/c`). External domain urls are not supported.  You can config `authPluginRedirectUrl` to an full URL string rather than a URL path (which imply current domain). However, unless an external domain is added to `authPluginAllowedExternalRedirectDomains`, an auth plugin should never redirect the user to the external domain. |
| global.awsRdsEndpoint | string | `nil` | AWS RDS DB instance access endpoint. e.g. xxxx.xxxx.ap-southeast-2.rds.amazonaws.com. Compulsory if `useAwsRdsDb` = true |
| global.defaultAdminUserId | string | `"00000000-0000-4000-8000-000000000000"` |  |
| global.defaultDatasetBucket | string | `"magda-datasets"` | The name of the bucket to store datasets in by default |
| global.enableLivenessProbes | bool | `false` | Whether or not enabled livenessProbes on all services |
| global.enableMultiTenants | bool | `false` |  |
| global.enablePriorityClass | bool | `false` | whether enable magda priority class.  When `true`, Magda will create priorityClassName from "magda-10" to "magda-0" where "magda-10" indicates the highest priority.  At this moment, "magda-10" is only allocated to gateway. Please note: When you use in-k8s postgreSQL, you need to manually set the priority class for db instance to `magda-9`  as it currently has no priority class set by default.  Other components will be auto-assigned appropriate priority class when `enablePriorityClass` is on. |
| global.exposeNodePorts | bool | `false` |  |
| global.externalUrl | string | `"http://localhost:6100"` |  |
| global.gapiIds | list | `[]` |  |
| global.image.pullPolicy | string | `"IfNotPresent"` |  |
| global.image.repository | string | `"ghcr.io/magda-io"` |  |
| global.logLevel | string | `"INFO"` |  |
| global.namespace | string | `"default"` |  |
| global.postgresql.autoCreateSecret | bool | `true` | When `true`, secret with name specified by `existingSecret` will be auto-created. When in-k8s PostgreSQL instance is used, the secret will be filled with auto-generated random password. Otherwise, the secret will only be auto created when "cloudsql-db-credentials" secret exist. And its content, for this case, will be copied from "cloudsql-db-credentials" secret, `password` field for backward compatibility purposes. Please note: when the secret (specified by `existingSecret`) exists, the auto-create feature will leave the password unchanged. |
| global.postgresql.existingSecret | string | `"db-main-account-secret"` | the secret that contains privileged PostgreSQL account password. The password will be loaded from key "postgresql-password" of the secret data. Previously (before v1.0.0), we used to load the password from "cloudsql-db-credentials" secret `password` field when use cloud provider DB services. Since v1.0.0, our helm chart can auto-create the secret and copy the content of "cloudsql-db-credentials" secret when: <ul>   <li> "autoCreateSecret" is set to true</li>   <li> "cloudsql-db-credentials" exists </li> </ul> for backward compatibility purposes. <br/><br/> Please note: when supplying the secret manually, it's recommend to set `"helm.sh/resource-policy": keep` annotation on the secret to avoid the secret being removed by Helm.<br/><br/> e.g. you can set the annotation of the secret with the following command:  `kubectl annotate --namespace [install namespace] secret db-main-account-secret 'helm.sh/resource-policy'=keep` |
| global.postgresql.postgresqlUsername | string | `"postgres"` | PostgreSQL username For in-k8s PostgreSQL, a user account will be auto-created with superuser privileges when username is `postgres`. It's recommended use superuser `postgres` for both in-k8s PostgreSQL or cloud provider DB services (e.g. CloudSQL or AWS RDS). This user will only be used for DB schema migrators to cerate DB schema and restricted DB accounts that are used by Magda internal services to access DB. If you have to use a user account rather than `postgres`, the user account needs to have sufficient permissions to run all DB migration scripts ([e.g. here](https://github.com/magda-io/magda/tree/master/magda-migrator-registry-db/sql)). Note: Until the ticket #3126 is fixed, using a DB username rather than `postgres` will trigger an error when content DB migrate runs. |
| global.rollingUpdate.maxUnavailable | int | `0` |  |
| global.searchEngine.hybridSearch.enabled | bool | `true` | whether to enable hybrid search. When `true`, Magda will combine the both LLM powered semantic (vector) & lexical (keyword) search to improve search relevance. [magda-embedding-api](https://github.com/magda-io/magda-embedding-api) will be enabled and used for embedding generation at both indexing & search stage for the semantic search. Please note: to turn on/off the hybrid search feature of a non-upgrade deployment, you need to: - manually delete the existing index,  - deploy and reindex the data by requesting full index action via indexer `reindex` API. When upgrade from older version, no manual actions are required (as a new index will be auto-created based on the index version number). |
| global.useAwsRdsDb | bool | `false` | whether to use AWS RDS DB config.  When this option is on, all other database type e.g. `useCombinedDb` & `useCloudSql` must be turned off. When this option is on and you want to set `autoCreateSecret` = true in order to auto create DB client password secret, you need to make sure magda.combined-db chart is selected (i.e. tags.combined-db = true). Otherwise, there will be no DB client password secret to be created (although `autoCreateSecret` = true ) |
| global.useCloudSql | bool | `false` | whether to use Google Cloud SQL database.  When this option is on, all other database type e.g. `useCombinedDb` & `useAwsRdsDb` must be turned off. When this option is on and you want to set `autoCreateSecret` = true in order to auto create DB client password secret, you need to make sure magda.combined-db chart is selected (i.e. tags.combined-db = true). Otherwise, there will be no DB client password secret to be created (although `autoCreateSecret` = true ) |
| global.useCombinedDb | bool | `true` |  |
| global.useInK8sDbInstance | object | `{"authorization-db":false,"content-db":false,"registry-db":false,"session-db":false,"tenant-db":false}` | When `useCombinedDb` = false, setting any key to true will create an in-k8s DB instance for the particular database. Please note: you must set `useCombinedDb` = false before set any of the field to `true`. Otherwise, all db requests will still be forwarded to the combined DB instance other than each individual database instance. |
| tags | object | see default value of each individual tag below. | Control on/ off of each modules.  To turn on/off openfaas, please set value to `global.openfaas.enabled` |
| tags.admin-api | bool | `false` | turn on / off [admin-api](../internal-charts/admin-api/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.all | bool | `true` | Set to `true` to turn on all default modules.  When `tags.all` is `false`, a default module will only be turned off when the corresponding module tag is `false` as well.  Please note: since v1.0.0, correspondence-api is not part of default modules anymore.  |
| tags.apidocs-server | bool | `false` | turn on / off [apidocs-server](../internal-charts/apidocs-server/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.authorization-api | bool | `false` | turn on / off [authorization-api](../internal-charts/authorization-api/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.authorization-db | bool | `false` | turn on / off [authorization-db](../internal-charts/authorization-db/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.cloud-sql-proxy | bool | `false` | turn on / off [cloud-sql-proxy](../internal-charts/cloud-sql-proxy/README.md) |
| tags.combined-db | bool | `false` | turn on / off [combined-db](../internal-charts/combined-db/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. Please not: unless you attempt to run logical DBs over seperate physical DBs (via `global.useInK8sDbInstance.xxx`),  you should always enable this module (even when you use cloud based DB service e.g. AWS RDS or Google Cloud SQL). |
| tags.content-api | bool | `false` | turn on / off [content-api](../internal-charts/content-api/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.content-db | bool | `false` | turn on / off [content-db](../internal-charts/content-db/README.md) |
| tags.correspondence-api | bool | `false` | turn on / off [content-db](../internal-charts/correspondence-api/README.md) |
| tags.elasticsearch | bool | `false` | turn on / off [elasticsearch](../internal-charts/elasticsearch/README.md) Please note: this module is no longer used since v4.0.0. `opensearch` chart is used instead. However, this module will still be kept for offering upgrade path for existing users v3 users. User can opt to turn on this `elasticsearch` to keep existing search engine running while building index on new opensearch engine. |
| tags.gateway | bool | `false` | turn on / off [gateway](../internal-charts/gateway/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.indexer | bool | `false` | turn on / off [indexer](../internal-charts/indexer/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.ingress | bool | `false` | turn on / off [ingress](../internal-charts/ingress/README.md) |
| tags.opensearch | bool | `false` | turn on / off [opensearch](../internal-charts/opensearch/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.opensearch-dashboards | bool | `false` | turn on / off [opensearch-dashboards](../internal-charts/opensearch-dashboards/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.preview-map | bool | `false` | turn on / off [preview-map](https://github.com/magda-io/magda-preview-map) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.priorities | bool | `true` | whether or not deploy Magda defined PriorityClass. Useful to schedule different payload on different nodes. |
| tags.rds-dev-proxy | bool | `false` | turn on / off [rds-dev-proxy](../internal-charts/rds-dev-proxy/README.md) It's only for accessing AWS RDS db for admin / testing purposes within the k8s cluster. |
| tags.registry-api | bool | `false` | turn on / off [registry-api](../internal-charts/registry-api/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.registry-db | bool | `false` | turn on / off [registry-db](../internal-charts/registry-db/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.search-api | bool | `false` | turn on / off [search-api](../internal-charts/search-api/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.search-api-node | bool | `false` | turn on / off [search-api-node](../internal-charts/search-api-node/README.md) It's an experimental nodejs implementation of search-api. Should only be turned on for testing purposes. |
| tags.session-db | bool | `false` | turn on / off [session-db](../internal-charts/session-db/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.storage-api | bool | `false` | turn on / off [storage-api](../internal-charts/storage-api/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.tenant-api | bool | `false` | turn on / off [tenant-api](../internal-charts/tenant-api/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.tenant-db | bool | `false` | turn on / off [tenant-db](../internal-charts/tenant-db/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |
| tags.web-server | bool | `false` | turn on / off [web-server](../internal-charts/web-server/README.md) Part of default modules. Only need to set to `true` to manually turn on when `tags.all` is false. |

