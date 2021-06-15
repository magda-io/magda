# How to Add An Authentication Plugin to Your Deployment

This document aims to provide some general information regarding Authentication Plugin installation. 
As each authentication plugin may choose to support extra config options, you should refer to the README.md document of the authentication plugin for complete list of available config options.

1. Add the authentication plugin as a [Helm Chart Dependency](https://helm.sh/docs/helm/helm_dependency/) in your deployment Helm Chart [Chart.yaml](https://helm.sh/docs/topics/charts/#chart-dependencies).

e.g. to add [internal authentication plugin](https://github.com/magda-io/magda-auth-internal), you can:

```yaml
- name: magda-auth-internal
  version: 1.0.1 # the version of internal authentication plugin
  repository: https://charts.magda.io
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
