# gateway

![Version: 0.0.58-alpha.0](https://img.shields.io/badge/Version-0.0.58--alpha.0-informational?style=flat-square)

The Gateway Component of Magda that routes incoming requets to other magda components.

## Requirements

Kubernetes: `>= 1.14.0-0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| auth.enableInternalAuthProvider | bool | true | Whether enable magda internal authentication provider.  |
| authPlugins | list | `[]` | a list of authentication plugin config item.  Each authentication plugin config item can contain the following fields: <ul> <li>`key`: (string) the unique key of the auth plugin. Allowed characters: [a-zA-Z0-9\-] </li> <li>`baseUrl`: (string) the `baseUrl` where gateway proxy request to. </li> </ul> More info on authentication plugin see [Authentication Plugin Specification](https://github.com/magda-io/magda/blob/master/docs/docs/authentication-plugin-spec.md) |
| autoscaler.enabled | bool | `false` |  |
| autoscaler.maxReplicas | int | `3` |  |
| autoscaler.minReplicas | int | `1` |  |
| autoscaler.targetCPUUtilizationPercentage | int | `80` |  |
| cookie | object | `{"sameSite":"lax"}` | Session cookie settings. <br/> Default value will be used if any options are left with blank.<br/> More info: https://github.com/expressjs/session#cookie <br/> Supported options are:<br/> <ul> <li>`expires`: A fix cookie expire date. The expires option should not be set directly; instead only use the maxAge option.</li> <li>`httpOnly`: Default: true.</li> <li>`maxAge`: Default: 7 * 60 * 60 * 1000.</li> <li>`path`: Default: '/'.</li> <li>`sameSite`: Default: false (not set).</li> <li>`secure1: Default: false (not set).</li> </ul> |
| cors.exposedHeaders[0] | string | `"Content-Range"` |  |
| cors.exposedHeaders[1] | string | `"X-Content-Range"` |  |
| cors.exposedHeaders[2] | string | `"Accept-Ranges"` |  |
| cors.exposedHeaders[3] | string | `"Content-Length"` |  |
| cors.exposedHeaders[4] | string | `"x-magda-event-id"` |  |
| csp.browserSniff | bool | `false` |  |
| csp.directives.objectSrc[0] | string | `"''none''"` |  |
| csp.directives.scriptSrc[0] | string | `"''self''"` |  |
| csp.directives.scriptSrc[1] | string | `"''unsafe-inline''"` |  |
| csp.directives.scriptSrc[2] | string | `"browser-update.org"` |  |
| csp.directives.scriptSrc[3] | string | `"blob:"` |  |
| csp.directives.workerSrc[0] | string | `"''self''"` |  |
| csp.directives.workerSrc[1] | string | `"blob:"` |  |
| defaultCacheControl | string | `"public, max-age=60"` | If a response that goes through the gateway doesn't set Cache-Control, it'll be set to this value. Set to null to disable. |
| defaultRoutes | object | Default value see [defaultRoutes Default Value](#default-value-for-defaultroutes-field) section below | Default routes list here are available under `/api/v0/` path. See [Proxy Target Definition](#proxy-target-definition) section below for route format. |
| enableAuthEndpoint | bool | `false` |  |
| enableCkanRedirection | bool | `false` |  |
| enableWebAccessControl | bool | `false` |  |
| helmet.frameguard | bool | `false` |  |
| image | object | `{}` |  |
| resources.limits.cpu | string | `"200m"` |  |
| resources.requests.cpu | string | `"50m"` |  |
| resources.requests.memory | string | `"40Mi"` |  |
| routes | string | `nil` | routes list here are available under `/api/v0/` path. If not specified, the value of `defaultRoutes` will be used. See below. |
| service.externalPort | int | `80` |  |
| service.internalPort | int | `80` |  |
| service.type | string | `"NodePort"` |  |
| web | string | `"http://web"` | Default web route.  This is the last route of the proxy. Main UI should be served from here. |
| webRoutes | object | `{"preview-map":"http://preview-map:6110"}` | extra web routes. See [Proxy Target Definition](#proxy-target-definition) section below for route format. |

#### Proxy Target Definition

A proxy target definition that defines `defaultRoutes` or `webRoutes` above support the following fields:
- `to`: target url
- `methods`: array of string. "all" means all methods
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
  registry:
    to: http://registry-api/v0
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
```