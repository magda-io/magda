# magda-core

![Version: 1.0.0-alpha.0](https://img.shields.io/badge/Version-1.0.0--alpha.0-informational?style=flat-square)

A complete solution for managing, publishing and discovering government data, private and open. This chart includes all core magda modules.

**Homepage:** <https://github.com/magda-io/magda>

## Source Code

* <https://github.com/magda-io/magda>

## Requirements

Kubernetes: `>= 1.14.0-0`

| Repository | Name | Version |
|------------|------|---------|
| file://../internal-charts/admin-api | admin-api | 1.0.0-alpha.0 |
| file://../internal-charts/apidocs-server | apidocs-server | 1.0.0-alpha.0 |
| file://../internal-charts/authorization-api | authorization-api | 1.0.0-alpha.0 |
| file://../internal-charts/authorization-db | authorization-db | 1.0.0-alpha.0 |
| file://../internal-charts/cloud-sql-proxy | cloud-sql-proxy | 1.0.0-alpha.0 |
| file://../internal-charts/combined-db | combined-db | 1.0.0-alpha.0 |
| file://../internal-charts/content-api | content-api | 1.0.0-alpha.0 |
| file://../internal-charts/content-db | content-db | 1.0.0-alpha.0 |
| file://../internal-charts/correspondence-api | correspondence-api | 1.0.0-alpha.0 |
| file://../internal-charts/elasticsearch | elasticsearch | 1.0.0-alpha.0 |
| file://../internal-charts/gateway | gateway | 1.0.0-alpha.0 |
| file://../internal-charts/indexer | indexer | 1.0.0-alpha.0 |
| file://../internal-charts/ingress | ingress | 1.0.0-alpha.0 |
| file://../internal-charts/opa | opa | 1.0.0-alpha.0 |
| file://../internal-charts/priorities | priorities | 1.0.0-alpha.0 |
| file://../internal-charts/rds-dev-proxy | rds-dev-proxy | 1.0.0-alpha.0 |
| file://../internal-charts/registry-api | registry-api | 1.0.0-alpha.0 |
| file://../internal-charts/registry-db | registry-db | 1.0.0-alpha.0 |
| file://../internal-charts/search-api-node | search-api-node | 1.0.0-alpha.0 |
| file://../internal-charts/search-api | search-api | 1.0.0-alpha.0 |
| file://../internal-charts/session-db | session-db | 1.0.0-alpha.0 |
| file://../internal-charts/storage-api | storage-api | 1.0.0-alpha.0 |
| file://../internal-charts/tenant-api | tenant-api | 1.0.0-alpha.0 |
| file://../internal-charts/tenant-db | tenant-db | 1.0.0-alpha.0 |
| file://../internal-charts/web-server | web-server | 1.0.0-alpha.0 |
| https://charts.magda.io | preview-map(magda-preview-map) | 1.0.1 |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| autoCreateAuthSecrets | bool | `true` | Whether or not auto create a k8s secrets named `auth-secrets` that contains: <ul> <li> JWT secret, under key: `jwt-secret`. Used internally by Magda gateway to issue JWT token.</li> <li> Session secret, under key: `session-secret`. Used by Magda gateway for managing session data.</li> </ul> The auto generated secrets will be 32 chars (256bits) long. |
| global.authPluginRedirectUrl | string | `"/sign-in-redirect"` | the redirection url after the whole authentication process is completed. Authentication Plugins will use this value as default setting. The following query paramaters can be used to supply the authentication result: <ul> <li>result: (string) Compulsory. Possible value: "success" or "failure". </li> <li>errorMessage: (string) Optional. Text message to provide more information on the error to the user. </li> </ul> The default "/sign-in-redirect" url supports an additional `redirectTo` query parameter. If this parameter not presents, user will be redirected further (at frontend) to account page /account. Otherwise, user will redirected to the url sepcified by `redirectTo` query parameter. |
| global.awsRdsEndpoint | string | `nil` | AWS RDS DB instance access endpoint. e.g. xxxx.xxxx.ap-southeast-2.rds.amazonaws.com. Compulsory if `useAwsRdsDb` = true |
| global.defaultAdminUserId | string | `"00000000-0000-4000-8000-000000000000"` |  |
| global.enableMultiTenants | bool | `false` |  |
| global.enablePriorityClass | bool | `false` |  |
| global.exposeNodePorts | bool | `false` |  |
| global.externalUrl | string | `"http://localhost:6100"` |  |
| global.gapiIds | list | `[]` |  |
| global.image.pullPolicy | string | `"IfNotPresent"` |  |
| global.image.repository | string | `"data61"` |  |
| global.logLevel | string | `"INFO"` |  |
| global.namespace | string | `"default"` |  |
| global.noDbAuth | bool | `false` |  |
| global.postgresql.autoCreateSecret | bool | `true` | When `true`, secret with name specified by `existingSecret` will be auto-created. When in-k8s PostgreSQL instance is used, the secret will be filled with auto-generated random password. Otherwise, the secret will only be auto created when "cloudsql-db-credentials" secret exist. And its content, for this case, will be copied from "cloudsql-db-credentials" secret, `password` field for backward compatibility purposes. Please note: when the secret (specified by `existingSecret`) exists, the auto-create feature will leave the password unchanged. |
| global.postgresql.existingSecret | string | `"db-main-account-secret"` | the secret that contains privileged PostgreSQL account password. The password will be loaded from key "postgresql-password" of the secret data. Previously (before v1.0.0), we used to load the password from "cloudsql-db-credentials" secret `password` field when use cloud provider DB services. Since v1.0.0, our helm chart can auto-create the secret and copy the content of "cloudsql-db-credentials" secret when: <ul>   <li> "autoCreateSecret" is set to true</li>   <li> "cloudsql-db-credentials" exists </li> </ul> for backward compatibility purposes. |
| global.postgresql.postgresqlUsername | string | `"postgres"` | PostgreSQL username For in-k8s PostgreSQL, a user account will be auto-created with superuser privileges when username is `postgres`. It's recommended use superuser `postgres` for both in-k8s PostgreSQL or cloud provider DB services (e.g. CloudSQL or AWS RDS). This user will only be used for DB schema migrators to cerate DB schema and restricted DB accounts that are used by Magda internal services to access DB. If you have to use a user account rather than `postgres`, the user account needs to have suffient permissions to run all DB migiration scripts ([e.g. here](https://github.com/magda-io/magda/tree/master/magda-migrator-registry-db/sql)). Note: Until the ticket #3126 is fixed, using a DB username rather than `postgres` will trigger an error when content DB migrate runs. |
| global.rollingUpdate.maxUnavailable | int | `0` |  |
| global.useAwsRdsDb | bool | `false` | whether to use AWS RDS DB config.  When this option is on, all other database type e.g. `useCombinedDb` & `useCloudSql` must be turned off. |
| global.useCloudSql | bool | `false` | whether to use Google Cloud SQL database.  When this option is on, all other database type e.g. `useCombinedDb` & `useAwsRdsDb` must be turned off. |
| global.useCombinedDb | bool | `true` |  |
| global.useInK8sDbInstance | object | `{"authorization-db":false,"content-db":false,"registry-db":false,"session-db":false,"tenant-db":false}` | When `useCombinedDb` = false, setting any key to true will create an in-k8s DB instance for the particular database. Please note: you must set `useCombinedDb` = false before set any of the field to `true`. Otherwise, all db requests will still be forwarded to the combined DB instance other than each individual database instance. |
| tags | object | see default value of each individual tag below. | (object) Control on/ off of each modules.  To turn on/off openfaas, please set value to `global.openfaas.enabled` |
| tags.admin-api | bool | `false` | turn on / off [admin-api](../internal-charts/admin-api/README.md) |
| tags.all | bool | `true` | turn on / off all modules |
| tags.apidocs-server | bool | `false` | turn on / off [apidocs-server](../internal-charts/apidocs-server/README.md) |
| tags.authorization-api | bool | `false` | turn on / off [authorization-api](../internal-charts/authorization-api/README.md) |
| tags.authorization-db | bool | `false` | turn on / off [authorization-db](../internal-charts/authorization-db/README.md) |
| tags.combined-db | bool | `false` | turn on / off [combined-db](../internal-charts/combined-db/README.md) |
| tags.content-api | bool | `false` | turn on / off [content-api](../internal-charts/content-api/README.md) |
| tags.content-db | bool | `false` | turn on / off [content-db](../internal-charts/content-db/README.md) |
| tags.correspondence-api | bool | `false` | turn on / off [content-db](../internal-charts/correspondence-api/README.md) |
| tags.elasticsearch | bool | `false` | turn on / off [elasticsearch](../internal-charts/elasticsearch/README.md) |
| tags.gateway | bool | `false` | turn on / off [gateway](../internal-charts/gateway/README.md) |
| tags.indexer | bool | `false` | turn on / off [indexer](../internal-charts/indexer/README.md) |
| tags.ingress | bool | `false` | turn on / off [ingress](../internal-charts/ingress/README.md) |
| tags.opa | bool | `false` | turn on / off [opa](../internal-charts/opa/README.md) |
| tags.preview-map | bool | `false` | turn on / off [preview-map](https://github.com/magda-io/magda-preview-map) |
| tags.priorities | bool | `true` | whether or not deploy Magda defined PriorityClass. Useful to schedule different payload on different nodes. |
| tags.registry-db | bool | `false` | turn on / off [registry-db](../internal-charts/registry-db/README.md) |
| tags.search-api | bool | `false` | turn on / off [search-api](../internal-charts/search-api/README.md) |
| tags.search-api-node | bool | `false` | turn on / off [search-api-node](../internal-charts/search-api-node/README.md) |
| tags.session-db | bool | `false` | turn on / off [session-db](../internal-charts/session-db/README.md) |
| tags.storage-api | bool | `false` | turn on / off [storage-api](../internal-charts/storage-api/README.md) |
| tags.tenant-api | bool | `false` | turn on / off [tenant-api](../internal-charts/tenant-api/README.md) |
| tags.tenant-db | bool | `false` | turn on / off [tenant-db](../internal-charts/tenant-db/README.md) |
| tags.web-server | bool | `false` | turn on / off [web-server](../internal-charts/web-server/README.md) |

