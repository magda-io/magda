# gateway

![Version: 0.0.58-alpha.0](https://img.shields.io/badge/Version-0.0.58--alpha.0-informational?style=flat-square)

The Gateway Component of Magda that routes incoming requets to other magda components.

## Requirements

Kubernetes: `>= 1.14.0-0`

## Values

##### Proxy Target Definition

A proxy target definition that defines `defaultRoutes` or `webRoutes` above support the following fields:
- `to`: target url
- `methods`: array of string. "all" means all methods
- `auth`: whether this target requires session. Otherwise, session / password related midddleware won't run
- `redirectTrailingSlash`: make /xxx auto redirect to /xxxx/
- `statusCheck`: check target's live status from the gateway
A proxy target be also specify in a simply string form, in which case, Gateway assumes a GET method, no auth proxy route is requested.

##### Cookie Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| auth.enableInternalAuthProvider | bool | `true` | Whether enable magda internal authentication provider.  @default true |
| autoscaler.enabled | bool | `false` |  |
| autoscaler.maxReplicas | int | `3` |  |
| autoscaler.minReplicas | int | `1` |  |
| autoscaler.targetCPUUtilizationPercentage | int | `80` |  |
| cookie | object | `{"sameSite":"lax"}` | Session cookie settings. Default value will be used if any options are left with blank. More info: https://github.com/expressjs/session#cookie Supported options are:  - `expires`: A fix cookie expire date. The expires option should not be set directly; instead only use the maxAge option. - `httpOnly`: Default: true. - `maxAge`: Default: 7 * 60 * 60 * 1000. - `path`: Default: '/'. - `sameSite`: Default: false (not set). - `secure1: Default: false (not set). |
| cors.exposedHeaders[0] | string | `"Content-Range"` |  |
| cors.exposedHeaders[1] | string | `"X-Content-Range"` |  |
| cors.exposedHeaders[2] | string | `"Accept-Ranges"` |  |
| cors.exposedHeaders[3] | string | `"Content-Length"` |  |
| csp.browserSniff | bool | `false` |  |
| csp.directives.objectSrc[0] | string | `"''none''"` |  |
| csp.directives.scriptSrc[0] | string | `"''self''"` |  |
| csp.directives.scriptSrc[1] | string | `"''unsafe-inline''"` |  |
| csp.directives.scriptSrc[2] | string | `"browser-update.org"` |  |
| csp.directives.scriptSrc[3] | string | `"blob:"` |  |
| csp.directives.workerSrc[0] | string | `"''self''"` |  |
| csp.directives.workerSrc[1] | string | `"blob:"` |  |
| defaultCacheControl | string | `"public, max-age=60"` | If a response that goes through the gateway doesn't set Cache-Control, it'll be set to this value. Set to null to disable. |
| defaultRoutes | object | `{"admin":{"auth":true,"to":"http://admin-api/v0"},"apidocs":{"redirectTrailingSlash":true,"to":"http://apidocs-server/"},"auth":{"auth":true,"to":"http://authorization-api/v0/public"},"content":{"auth":true,"to":"http://content-api/v0"},"correspondence":{"to":"http://correspondence-api/v0/public"},"opa":{"auth":true,"statusCheck":false,"to":"http://authorization-api/v0/opa"},"registry":{"auth":true,"to":"http://registry-api/v0"},"registry-auth":{"auth":true,"to":"http://registry-api/v0"},"registry-read-only":{"auth":true,"to":"http://registry-api-read-only/v0"},"search":{"auth":true,"to":"http://search-api/v0"},"storage":{"auth":true,"to":"http://storage-api/v0"},"tenant":{"auth":true,"to":"http://tenant-api/v0"}}` | Routes list here are available under `/api/v0/` path. See `Proxy Target Definition` for route format. |
| enableAuthEndpoint | bool | `false` |  |
| enableCkanRedirection | bool | `false` |  |
| enableWebAccessControl | bool | `false` |  |
| helmet.frameguard | bool | `false` |  |
| image | object | `{}` |  |
| resources.limits.cpu | string | `"200m"` |  |
| resources.requests.cpu | string | `"50m"` |  |
| resources.requests.memory | string | `"40Mi"` |  |
| service.externalPort | int | `80` |  |
| service.internalPort | int | `80` |  |
| service.type | string | `"NodePort"` |  |
| web | string | `"http://web"` | Default web route.  This is the last route of the proxy. Main UI should be served from here. |
| webRoutes | object | `{"preview-map":"http://preview-map:6110"}` | extra web routes. See `Proxy Target Definition` for route format. |