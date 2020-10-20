# gateway

![Version: 0.0.58-alpha.0](https://img.shields.io/badge/Version-0.0.58--alpha.0-informational?style=flat-square)

The Gateway Component of Magda that routes incoming requets to other magda components.

## Requirements

Kubernetes: `>= 1.14.0-0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| auth.enableInternalAuthProvider | bool | `true` | Whether enable magda internal authentication provider.  @default true |
| authPluginRedirectUrl | string | `"/sign-in-redirect"` | the redirection url after the whole authentication process is completed. The following query paramaters can be used to supply the authentication result: <ul> <li>result: (string) Compulsory. Possible value: "success" or "failure". </li> <li>errorMessage: (string) Optional. Text message to provide more information on the error to the user. </li> </ul> |
| authPlugins | list | `[]` | a list of authentication plugin config item. More info of config item see [Authentication Plugin Config](#authentication-plugin-config) section below. |
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
| defaultRoutes | object | Default value see [defaultRoutes Default Value](#default-value-for-defaultroutes-field) section below | Routes list here are available under `/api/v0/` path. See [Proxy Target Definition](#proxy-target-definition) section below for route format. |
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
| webRoutes | object | `{"preview-map":"http://preview-map:6110"}` | extra web routes. See [Proxy Target Definition](#proxy-target-definition) section below for route format. |

#### Proxy Target Definition

A proxy target definition that defines `defaultRoutes` or `webRoutes` above support the following fields:
- `to`: target url
- `methods`: array of string. "all" means all methods
- `auth`: whether this target requires session. Otherwise, session / password related midddleware won't run
- `redirectTrailingSlash`: make /xxx auto redirect to /xxxx/
- `statusCheck`: check target's live status from the gateway
A proxy target be also specify in a simply string form, in which case, Gateway assumes a GET method, no auth proxy route is requested.

#### Authentication Plugin Config

Each authentication plugin config item can contain the following fields:
- `key`: (string) the unique key of the auth plugin. Allowed characters: [a-zA-Z0-9\-]
- `name`: (string) the display name of the auth plugin
- `iconUrl`: (string) the display icon of the auth plugin
- `authenticationMethod`: (string) The authentication method of the plugin. Support values are:
  - "IDP-URI-REDIRECTION": the plugin will rediredct user agent to idp (identity provider) for authentication. e.g. Google & fackebook oauth etc.
  - "PASSWORD": the plugin expect frontend do a form post that contains username & password to the plugin for authentication.
  - "REPLY-PARTY-QR-CODE": the plugin offers a QR-code image url and expect the user scan the QR code with a mobile app to complete the authentication.
- `loginFormExtraInfoHeading`: (string) Optional; Only applicable when authenticationMethod = "PASSWORD".
  - If present, will displayed the heading underneath the login form to provide extra info to users. e.g. how to reset password
- `loginFormExtraInfoContent`: (string) Optional; Only applicable when authenticationMethod = "PASSWORD".
  - If present, will displayed the content underneath the login form to provide extra info to users. e.g. how to reset password
  - Can support content in markdown format
- `loginFormUsernameFieldLabel`: (string) Optional; Only applicable when authenticationMethod = "PASSWORD". Default value: `Username`
- `loginFormPasswordFieldLabel`: (string) Optional; Only applicable when authenticationMethod = "PASSWORD". Default value: `Password`
- `qrCodeImgUrl`: (string) Only applicable & compulsory when authenticationMethod = "REPLY-PARTY-QR-CODE".
- `qrCodeExtraInfoHeading`: (string) Optional; Only applicable when authenticationMethod = "REPLY-PARTY-QR-CODE".
  - If present, will displayed the heading underneath the QR Code image to provide extra instruction to users. e.g. how to download moile app to scan the QR Code
- `qrCodeExtraInfoContent`: (string) Optional; Only applicable when authenticationMethod = "PASSWORD".
  - If present, will displayed the content underneath the login form to provide extra info to users. e.g. how to download moile app to scan the QR Code
  - Can support content in markdown format

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