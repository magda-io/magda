# gateway

![Version: 5.5.0](https://img.shields.io/badge/Version-5.5.0-informational?style=flat-square)

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
| csp | object | `{}` | Since Magda v5, the content security policy config section here is deprecated. You should set `content security policy` config via the `contentSecurityPolicy` key of the `helmet` config section. This config section is still supported for backwards compatibility reasons and will be removed in future. The config supplied here will override the config supplied via `helmet.contentSecurityPolicy.directives`. |
| defaultCacheControl | string | `"public, max-age=60"` | If a response that goes through the gateway doesn't set Cache-Control, it'll be set to this value. Set to null to disable. |
| defaultImage.pullPolicy | string | `"IfNotPresent"` |  |
| defaultImage.pullSecrets | bool | `false` |  |
| defaultImage.repository | string | `"ghcr.io/magda-io"` |  |
| defaultRoutes | object | Default value see [defaultRoutes Default Value](#default-value-for-defaultroutes-field) section below | Default routes list here are available under `/api/v0/` path. See [Proxy Target Definition](#proxy-target-definition) section below for route format. |
| defaultWebRouteConfig.auth | bool | `false` | whether this target requires session. Otherwise, session / password related midddleware won't run |
| defaultWebRouteConfig.methods | list | `["GET"]` | array of string. "all" means all methods will be proxied  |
| defaultWebRouteConfig.redirectTrailingSlash | bool | `false` | make /xxx auto redirect to /xxxx/ |
| defaultWebRouteConfig.to | string | `""` | the default web router proxy target. Optional. If set, the default web route set via `web` option will be ignored. |
| disableGzip | bool | `false` | By default, response will be auto-gizpped depends on MIME type. Set this to true to disable it. |
| enableAuthEndpoint | bool | `true` | whether or not enable auth endpoint. You can turn it off if you don't need to log into any account. |
| enableCkanRedirection | bool | `false` | wether or not enable CKAN redirection. when it's on, any incoming ckan alike URL will be redirected to the CKAN instance URL  that is specified by config option `ckanRedirectionDomain` and `ckanRedirectionPath`. |
| enableHttpsRedirection | bool | `false` | whether or not redirect incoming request using HTTP protocol to HTTPs |
| enableWebAccessControl | bool | `false` | wether or not enable http basic auth access control. `username` & `password` will be retrieved from k8s secrets `web-access-secret`, `username` & `password` fields. |
| helmet | object | `{"contentSecurityPolicy":{"directives":{"defaultSrc":null,"fontSrc":null,"imgSrc":null,"scriptSrc":["'self'"],"scriptSrcAttr":null,"styleSrc":null,"workerSrc":["'self'","blob:"]}},"originAgentCluster":false,"referrerPolicy":{"policy":"strict-origin-when-cross-origin"},"strictTransportSecurity":false,"xContentTypeOptions":false,"xDnsPrefetchControl":false,"xDownloadOptions":false,"xFrameOptions":false,"xPermittedCrossDomainPolicies":false}` | Helmet config options. See https://www.npmjs.com/package/helmet Since Magda v5, you should supply content security policy config via `contentSecurityPolicy` key here. A separate `csp` config section for content security policy is deprecated and will be removed in future. You should review the default config values here and [helmet default settings](https://github.com/helmetjs/helmet?tab=readme-ov-file#reference) to determine whether you need to change the settings here. |
| helmetPerPath | object | `{}` | Allow optionally to set different helmet config per request path. e.g. you can specify different config for path `/routeA/abc` with: helmetPerPath:   "/routeA/abc":      referrerPolicy:       policy: strict-origin-when-cross-origin |
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
- `accessControl`: whether the access of this target will be controlled by the built-in access control.
  - If `accessControl` is set to `true`, the gateway will check the access control of this target. Default: `false`
  - You can create a `api/[basepath]` resource in `settings` UI to present the access to this target. Here, `[basepath]` is the `string key` when configure this `Proxy Target`.
    - e.g. In the `defaultRoutes` below, the `basepath` of `search` is `search`, so you can create a `api/search` resource in `settings` UI to control the access of this target.
    - Or create a `api/registry` resource to control the access of `registry` target.
    - Or create a `api/registry/hooks` resource to control the access of `registry/hooks` target.
  - Besides `resource`, you are also required to define `operation` one or more `operation` that associate with the created resource in order to grant the access to any user roles.
    - The `operation` should be created in the format of `api/[basepath]/[path pattern]/[method]`.
      - Here, `[method]` is the HTTP method of the requests. `ALL` means all methods will be matched.
      - `[path pattern]` is the path pattern (in glob notion, see [here](https://www.openpolicyagent.org/docs/latest/policy-reference/#glob) for more info) of the requests. `*` means any path. `**` means any path and its sub-paths.
    - e.g. For `api/registry` resources, you can create `operation` `api/registry/**/ALL` to control the access of all methods of `registry` target. Here, `**` will match any path.
    - Or create `operation` `api/registry/records/records/123/GET` to match `GET` HTTP request with path to `records/123`.
  - Once the system admin creates proper `resource` & `operation` records for the proxy target, he can grant access to those endpoints by creating permission & role records.
  - More information of the access control system, please refer to [this doc](https://github.com/magda-io/magda/blob/main/docs/docs/architecture/Guide%20to%20Magda%20Internals.md#new-authorisation-model--implementation)

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