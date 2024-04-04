# gateway

![Version: 3.0.1](https://img.shields.io/badge/Version-3.0.1-informational?style=flat-square)

The Gateway Component of Magda that routes incoming requets to other magda components.

## Requirements

Kubernetes: `>= 1.14.0-0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| additionalRoutes | object | {} | a list of additional routes that should be avaialble under `/api/v0/` path. Different from `routes` config field, routes supplied via this field will merge with `defaultRoutes` (default system API routes). Therefore, users doesn't have to specify all default system API routes in this field in order to keep all system API routes working. When users supply value via this config field, any value supplied via `routes` field will be ignored. |
| authPlugins | list | `[]` | a list of authentication plugin config item.  Each authentication plugin config item can contain the following fields: <ul> <li>`key`: (string) the unique key of the auth plugin. Allowed characters: [a-zA-Z0-9\-] </li> <li>`baseUrl`: (string) the `baseUrl` where gateway proxy request to. </li> </ul> More info on authentication plugin see [Authentication Plugin Specification](https://github.com/magda-io/magda/blob/master/docs/docs/authentication-plugin-spec.md) |
| autoscaler.enabled | bool | `false` |  |
| autoscaler.maxReplicas | int | `3` |  |
| autoscaler.minReplicas | int | `1` |  |
| autoscaler.targetCPUUtilizationPercentage | int | `80` |  |
| ckanRedirectionDomain | string | `nil` | CKAN redirection target CKAN instance domain (e.g. `data.gov.au`). See `enableCkanRedirection` for more details. |
| ckanRedirectionPath | string | `nil` | CKAN redirection target CKAN instance path (e.g. `/data`). See `enableCkanRedirection` for more details. |
| cookie | object | default value see `Description` | Session cookie settings. <br/> More info: https://github.com/expressjs/session#cookie <br/> Supported options are:<br/> <ul> <li>`expires`: A fix cookie expire date. The expires option should not be set directly; instead only use the maxAge option.</li> <li>`httpOnly`: Default: true.</li> <li>`maxAge`: Default: 7 * 60 * 60 * 1000 (7 hours)</li> <li>`path`: Default: '/'.</li> <li>`sameSite`: Default: lax </li> <li>`secure`: Default: true </li> </ul> |
| cors.exposedHeaders[0] | string | `"Content-Range"` |  |
| cors.exposedHeaders[1] | string | `"X-Content-Range"` |  |
| cors.exposedHeaders[2] | string | `"Accept-Ranges"` |  |
| cors.exposedHeaders[3] | string | `"Content-Length"` |  |
| cors.exposedHeaders[4] | string | `"x-magda-event-id"` |  |
| csp.browserSniff | bool | `false` |  |
| csp.directives.frame-ancestors[0] | string | `"'self'"` |  |
| csp.directives.objectSrc[0] | string | `"'none'"` |  |
| csp.directives.scriptSrc[0] | string | `"'self'"` |  |
| csp.directives.scriptSrc[1] | string | `"'unsafe-inline'"` |  |
| csp.directives.scriptSrc[2] | string | `"https://*.googletagmanager.com"` |  |
| csp.directives.workerSrc[0] | string | `"'self'"` |  |
| csp.directives.workerSrc[1] | string | `"blob:"` |  |
| defaultCacheControl | string | `"public, max-age=60"` | If a response that goes through the gateway doesn't set Cache-Control, it'll be set to this value. Set to null to disable. |
| defaultImage.pullPolicy | string | `"IfNotPresent"` |  |
| defaultImage.pullSecrets | bool | `false` |  |
| defaultImage.repository | string | `"docker.io/data61"` |  |
| defaultRoutes | object | Default value see [defaultRoutes Default Value](#default-value-for-defaultroutes-field) section below | Default routes list here are available under `/api/v0/` path. See [Proxy Target Definition](#proxy-target-definition) section below for route format. |
| defaultWebRouteConfig.auth | bool | `false` | whether this target requires session. Otherwise, session / password related midddleware won't run |
| defaultWebRouteConfig.methods | list | `["GET"]` | array of string. "all" means all methods will be proxied  |
| defaultWebRouteConfig.redirectTrailingSlash | bool | `false` | make /xxx auto redirect to /xxxx/ |
| defaultWebRouteConfig.to | string | `""` | the default web router proxy target. Optional. If set, the default web route set via `web` option will be ignored. |
| enableAuthEndpoint | bool | `true` | whether or not enable auth endpoint. You can turn it off if you don't need to log into any account. |
| enableCkanRedirection | bool | `false` | wether or not enable CKAN redirection. when it's on, any incoming ckan alike URL will be redirected to the CKAN instance URL  that is specified by config option `ckanRedirectionDomain` and `ckanRedirectionPath`. |
| enableHttpsRedirection | bool | `false` | whether or not redirect incoming request using HTTP protocol to HTTPs |
| enableWebAccessControl | bool | `false` | wether or not enable http basic auth access control. `username` & `password` will be retrieved from k8s secrets `web-access-secret`, `username` & `password` fields. |
| helmet.frameguard | bool | `false` |  |
| image.name | string | `"magda-gateway"` |  |
| proxyTimeout | int | nil (120 seconds default value will be used by upstream lib internally) | How long time (in seconds) before upstream service must complete request in order to avoid request timeout error. If not set, the request will time out after 120 seconds. |
| registryQueryCacheMaxKeys | number | `nil` | Specifies a maximum amount of keys that can be stored in the registryQueryCache. By default, it will be set to 500 seconds if leave blank. |
| registryQueryCacheStdTTL | number | `nil` | The standard ttl as number in seconds for every generated cache element in the registryQueryCache. To disable the cache, set this value to `0`. By default, it will be set to 600 seconds if leave blank. |
| resources.limits.cpu | string | `"200m"` |  |
| resources.requests.cpu | string | `"50m"` |  |
| resources.requests.memory | string | `"40Mi"` |  |
| routes | object | {} | routes list here are available under `/api/v0/` path. If empty, the value of `defaultRoutes` will be used. See below. |
| service.externalPort | int | `80` |  |
| service.internalPort | int | `80` |  |
| service.type | string | `"NodePort"` |  |
| skipAuth | bool | `false` | when set to true, API will not query policy engine for auth decision but assume it's always permitted.  It's for debugging only. |
| web | string | `"http://web"` | Default web route.  This is the last route of the proxy. Main UI should be served from here. |
| webRoutes | object | `{"preview-map":"http://preview-map:6110"}` | extra web routes. See [Proxy Target Definition](#proxy-target-definition) section below for route format. |

#### Proxy Target Definition

A proxy target definition that defines `defaultRoutes` or `webRoutes` above support the following fields:
- `to`: target url
- `methods`: array of string or objects with fields "method" & "target".
  - When the array item is a string, the string stands for the HTTP method. "all" means all methods.
  - When the array item us an object, the object can have the following fields:
    - "method": the HTTP method of the requests to be proxied. "all" means all methods.
    - "target": the alternative proxy target URL
- `auth`: whether this target requires session. Otherwise, session / password related midddleware won't run
- `redirectTrailingSlash`: make /xxx auto redirect to /xxxx/
- `statusCheck`: check target's live status from the gateway

A proxy target be also specify in a simply string form, in which case, Gateway assumes a GET method, no auth proxy route is requested.

#### Default Value for `defaultRoutes` field

```yaml
defaultRoutes:
  search:
    to: http://search-api/v0
    auth: true
  "registry/hooks":
    to: http://registry-api/v0/hooks
    auth: true
  registry:
    to: http://registry-api/v0
    methods:
    - method: get
      target: http://registry-api-read-only/v0
    - method: head
      target: http://registry-api-read-only/v0
    - method: options
      target: http://registry-api-read-only/v0
    - method: post
      target: http://registry-api/v0
    - method: put
      target: http://registry-api/v0
    - method: patch
      target: http://registry-api/v0
    - method: delete
      target: http://registry-api/v0
    auth: true
  registry-read-only:
    to: http://registry-api-read-only/v0
    auth: true
  registry-auth: #left here for legacy reasons - use /registry
    to: http://registry-api/v0
    auth: true
  auth:
    to: http://authorization-api/v0/public
    auth: true
  opa:
    to: http://authorization-api/v0/opa
    auth: true
    statusCheck: false
  admin:
    to: http://admin-api/v0
    auth: true
  content:
    to: http://content-api/v0
    auth: true
  storage:
    to: http://storage-api/v0
    auth: true
  correspondence:
    to: http://correspondence-api/v0/public
  apidocs:
    to: http://apidocs-server/
    redirectTrailingSlash: true
  tenant:
    to: http://tenant-api/v0
    auth: true
  "indexer/reindex":
    to: http://indexer/v0/reindex
    auth: true
  "indexer/dataset":
    to: http://indexer/v0/dataset
    auth: true
```