# gateway

![Version: 0.0.58-alpha.0](https://img.shields.io/badge/Version-0.0.58-alpha.0-informational?style=flat-square)

A Helm chart for Kubernetes

## Requirements

Kubernetes: `>= 1.14.0-0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| auth.enableInternalAuthProvider | bool | `true` |  |
| autoscaler.enabled | bool | `false` |  |
| autoscaler.maxReplicas | int | `3` |  |
| autoscaler.minReplicas | int | `1` |  |
| autoscaler.targetCPUUtilizationPercentage | int | `80` |  |
| cookie.sameSite | string | `"lax"` |  |
| cors.exposedHeaders[0] | string | `"Content-Range"` |  |
| cors.exposedHeaders[1] | string | `"X-Content-Range"` |  |
| csp.browserSniff | bool | `false` |  |
| csp.directives.objectSrc[0] | string | `"''none''"` |  |
| csp.directives.scriptSrc[0] | string | `"''self''"` |  |
| csp.directives.scriptSrc[1] | string | `"''unsafe-inline''"` |  |
| csp.directives.scriptSrc[2] | string | `"browser-update.org"` |  |
| csp.directives.scriptSrc[3] | string | `"blob:"` |  |
| csp.directives.workerSrc[0] | string | `"''self''"` |  |
| csp.directives.workerSrc[1] | string | `"blob:"` |  |
| defaultCacheControl | string | `"public, max-age=60"` |  |
| defaultRoutes.admin.auth | bool | `true` |  |
| defaultRoutes.admin.to | string | `"http://admin-api/v0"` |  |
| defaultRoutes.apidocs.redirectTrailingSlash | bool | `true` |  |
| defaultRoutes.apidocs.to | string | `"http://apidocs-server/"` |  |
| defaultRoutes.auth.auth | bool | `true` |  |
| defaultRoutes.auth.to | string | `"http://authorization-api/v0/public"` |  |
| defaultRoutes.content.auth | bool | `true` |  |
| defaultRoutes.content.to | string | `"http://content-api/v0"` |  |
| defaultRoutes.correspondence.to | string | `"http://correspondence-api/v0/public"` |  |
| defaultRoutes.opa.auth | bool | `true` |  |
| defaultRoutes.opa.statusCheck | bool | `false` |  |
| defaultRoutes.opa.to | string | `"http://authorization-api/v0/opa"` |  |
| defaultRoutes.registry-auth.auth | bool | `true` |  |
| defaultRoutes.registry-auth.to | string | `"http://registry-api/v0"` |  |
| defaultRoutes.registry-read-only.auth | bool | `true` |  |
| defaultRoutes.registry-read-only.to | string | `"http://registry-api-read-only/v0"` |  |
| defaultRoutes.registry.auth | bool | `true` |  |
| defaultRoutes.registry.to | string | `"http://registry-api/v0"` |  |
| defaultRoutes.search.auth | bool | `true` |  |
| defaultRoutes.search.to | string | `"http://search-api/v0"` |  |
| defaultRoutes.storage.auth | bool | `true` |  |
| defaultRoutes.storage.to | string | `"http://storage-api/v0"` |  |
| defaultRoutes.tenant.auth | bool | `true` |  |
| defaultRoutes.tenant.to | string | `"http://tenant-api/v0"` |  |
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
| web | string | `"http://web"` |  |
| webRoutes.preview-map | string | `"http://preview-map:6110"` |  |
