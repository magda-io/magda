# How to Add An Authentication Plugin to Your Deployment

This document aims to provide some general information regarding Authentication Plugin installation.
As each authentication plugin may choose to support extra config options, you should refer to the README.md document of the authentication plugin for complete list of available config options.

1. Add the authentication plugin as a [Helm Chart Dependency](https://helm.sh/docs/helm/helm_dependency/) in your deployment Helm Chart [Chart.yaml](https://helm.sh/docs/topics/charts/#chart-dependencies).

e.g. to add [internal authentication plugin](https://github.com/magda-io/magda-auth-internal), you can:

```yaml
- name: magda-auth-internal
  version: "2.0.0" # the version of internal authentication plugin
  repository: "oci://ghcr.io/magda-io/charts"
  tags:
    - all
    - magda-auth-internal
```

2. Turn on the plugin via [Helm tags](https://helm.sh/docs/topics/charts/#tags-and-condition-fields-in-dependencies) in your deployment [Values file](https://helm.sh/docs/chart_template_guide/values_files/).

When adding the plugin as dependency in step 1, we defined two tags `all` & `magda-auth-internal`. In helm, you can turn on/off the dependencies via the tags defined. If the dependency is turned of, it won't be deployed even it's added as a dependency of your deployment chart.

Therefore, you need to make sure either of the tag is enabled in your deployment [Values file](https://helm.sh/docs/chart_template_guide/values_files/).

e.g. you can set `magda-auth-internal` tag to `true` under tags section in your deployment [Values file](https://helm.sh/docs/chart_template_guide/values_files/) like:

```yaml
tags:
  magda-auth-internal: true
```

3. (Optional) Config the auth plugin in your deployment [Values file](https://helm.sh/docs/chart_template_guide/values_files/).

The complete list of available config option can normally find from the `Values` section of the authentication plugin's README.md document.

e.g. You can optionally set the text content below the login form for the [internal authentication plugin](https://github.com/magda-io/magda-auth-internal).

```yaml
magda-auth-internal:
  authPluginConfig:
    loginFormExtraInfoContent: "Forgot your password? Email [test@test.com](test@test.com)"
```

4. Config Gatway (in your deployment [Values file](https://helm.sh/docs/chart_template_guide/values_files/)) to add the auth plugin to Gateway's plugin list (More details see [here](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/gateway/README.md))

e.g. You can add [internal authentication plugin](https://github.com/magda-io/magda-auth-internal) support to your system as the following:

```yaml
gateway:
  authPlugins:
    - key: internal
      baseUrl: http://magda-auth-internal
```

## Magda version compatibility (plugin authors)

Magda v7 encrypts service-to-database connections by default. Authentication
plugins connect to the session database, so a plugin has to opt in to that
behaviour — and because Helm merges every chart's templates into one flat,
global namespace where the last definition wins (ordered by chart name), a
plugin's own vendored copy of `magda-common` would otherwise silently override
Magda's. `magda-auth-*` sorts after `magda`, so the plugin copy always wins.

### What a plugin needs to do

Call the versioned helper from your deployment template, alongside the existing
credential helper:

```yaml
{{- include "magda.db-client-credential-env" (dict "dbName" "session-db" "root" .) | indent 8 }}
{{- include "magda.db-client-sslmode-env-v1" . | indent 8 }}
```

and declare the compatibility flag in your chart's `values.yaml`:

```yaml
global:
  # Verifies this plugin was built for the Magda version it is deployed with.
  # Must default to `true`; see below for why CI sets it to `false`.
  magdaCompatibilityCheck: true
```

`magda.db-client-sslmode-env-v1` is a thin shim that delegates to Magda's own
implementation, so there is no copy of the TLS logic in your chart to drift out
of sync. Its behaviour is frozen: if Magda ever changes what the helper emits,
it will publish `-v2` and leave `-v1` alone, so a vendored copy of `-v1` is
always safe.

### This requires Magda v7 or later

The shim delegates to templates that only exist in `magda-core` v7+. Deployed
against an older Magda, the render fails with:

```
no template "magda.compatibility-check" associated with template "gotpl"
```

That is deliberate — the alternative (a no-op fallback in `magda-common`) would
be overridden by the plugin's own copy and silently disable the check. State the
requirement in your plugin's README and release notes:

> Requires Magda v7+. To run against Magda v6, set
> `global.magdaCompatibilityCheck=false` — the plugin will then connect to the
> session database without TLS, matching v6 behaviour.

Because the flag is a **global**, an operator sets it once for all plugins
rather than per chart.

### CI, `helm lint` and `helm template`

Rendering a plugin chart on its own has no `magda-core` present, so those
templates are missing and the render fails. Pass the flag in your plugin repo's
chart test steps:

```bash
helm lint ./deploy/my-plugin --set global.magdaCompatibilityCheck=false
helm template test ./deploy/my-plugin --set global.magdaCompatibilityCheck=false
```

Only plugin repositories need this. The main Magda repository does not — its own
charts call `magda.db-client-sslmode-env` directly, and the handshake itself is
covered by `deploy/helm/magda-core/tests/compatibility-check.sh`.

### If the versions do not match

When a plugin declares a contract this Magda version no longer supports, the
install fails at render time with a message naming both the chart and the
contract, rather than starting a deployment that misbehaves:

```
Chart "magda-auth-oidc" uses the Magda helper contract "db-client-sslmode-env-v0",
which this version of Magda does not support (supported: db-client-sslmode-env-v1).
Upgrade or downgrade "magda-auth-oidc" to a release built for this Magda version.
```
