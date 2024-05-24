### How to expose OpenSearch Dashboards

Since v4, Magda switched its search engine to [OpenSearch](https://opensearch.org/). The default deployment also includes the [OpenSearch Dashboards](https://opensearch.org/docs/latest/dashboards/). It offers a web UI that lets you access OpenSearch data / API easier. By default, this service is not accessible externally and can only be accessed via [port-forward](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_port-forward/).

To make the service accessible externally, you need:

#### 1. Config `gateway` helm chart to add additional web route

```yaml
gateway:
  webRoutes:
    opensearch-dashboards:
      to: http://opensearch-dashboards:5601/opensearch-dashboards
      accessControl: true
```

The above `webRoutes` config will make OpenSearch dashboard accessible at `https://my-magda-host/opensearch-dashboards`.

`accessControl` key will make sure only authorized users can access this route.

> More details of Magda gateway helm chart config can be found from https://github.com/magda-io/magda/blob/main/deploy/helm/internal-charts/gateway/README.md

#### 2. Config `opensearch-dashboards` chart basePath

```yaml
opensearch-dashboards:
  config:
    opensearch_dashboards.yml:
      server.basePath: "/opensearch-dashboards"
      server.rewriteBasePath: true
```

The above config will make `opensearch-dashboards` serve all request at `/opensearch-dashboards`, which matches the external access path configured in step 1.

#### 3. Grant permission to authorized users

> By default, admin users have access to any resources operations. You don't need to config the access if you only want to access OpenSearch Dashboard with admin users.

Go to `Settings` UI (only accessible to `admin` users), and:

- Create `resource` record `api/opensearch-dashboards`
- Create the following `operation` for above `resource`:
  - `api/opensearch-dashboards/**/ALL`
    - This indicates the created `operation` presents HTTP requests with any method & any request paths.
    - More details of controlling access of route, please see [here](https://github.com/magda-io/magda/blob/main/deploy/helm/internal-charts/gateway/README.md#proxy-target-definition).
- Add a permission record with access to the `operation` above and either add the permission to an existing user role or create a new one.
