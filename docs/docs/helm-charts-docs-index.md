# Magda Helm Chart Reference

Magda use [Helm](https://helm.sh/) to pack our microservice components as reusable packages --- [helm charts](https://helm.sh/docs/topics/charts/). You can customise Magda (even create your own app) by declaring different sets of Magda helm charts as [dependencies](https://helm.sh/docs/chart_template_guide/subcharts_and_globals/). Each of Helm chart supports customisable configuration options via [values files](https://helm.sh/docs/chart_template_guide/values_files/) that allow you to further customise its functions. This document provides the basic info of Magda Helm chart repository and the documentation links of all released Magda Helm Charts.

# Magda Helm Chart Repository

Our helm charts are published at [helm chart repository](https://helm.sh/docs/helm/helm_repo_add/): `https://charts.magda.io/`

You can add Magda's Helm chart repo by:

```bash
helm repo add magda-io https://charts.magda.io
```

To search Magda's chart repo, you can:

```bash
helm search repo magda-io --devel
```

Here `--devel` means includes development versions.

# Magda Helm Chart Documentation Index

> Please note: the links belew are pointing to Master branch of our Github Repository. If you want to check the documentation of an older version of Magda Helm Chart, please switch to the [tags](https://github.com/magda-io/magda/tags) of your version.

> We use [helm-docs](https://github.com/norwoodj/helm-docs) to auto generate docs from Helm Chart values files. You can use it to generate documentation for older version of Magda helm charts as well.

> The quality of the document depends on the comments we add to the values files. We will keep making improvement in this area.

-   [magda](https://github.com/magda-io/magda/blob/master/deploy/helm/magda/README.md): Includes all built-in components. This is the default package to choose unless you want to customise Magda.
-   [magda-core](https://github.com/magda-io/magda/blob/master/deploy/helm/magda-core/README.md): Includes only core components. You may choose to use this package when you only need basic functionality or build your own app.
-   Internal Magda Helm Charts / Components:
    -   [admin-api](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/admin-api/README.md)
    -   [apidocs-server](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/apidocs-server/README.md)
    -   [authorization-api](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/authorization-api/README.md)
    -   [authorization-db](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/authorization-db/README.md)
    -   [cloud-sql-proxy](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/cloud-sql-proxy/README.md)
    -   [combined-db](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/combined-db/README.md)
    -   [content-api](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/content-api/README.md)
    -   [content-db](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/content-db/README.md)
    -   [correspondence-api](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/correspondence-api/README.md)
    -   [elasticsearch](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/elasticsearch/README.md)
    -   [gateway](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/gateway/README.md)
    -   [indexer](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/indexer/README.md)
    -   [ingress](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/ingress/README.md)
    -   [opa](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/opa/README.md)
    -   [registry-api](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/registry-api/README.md)
    -   [registry-db](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/registry-db/README.md)
    -   [search-api](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/search-api/README.md)
    -   [session-db](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/session-db/README.md)
    -   [storage-api](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/storage-api/README.md)
    -   [tenant-api](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/tenant-api/README.md)
    -   [tenant-db](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/tenant-db/README.md)
    -   [web-server](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/web-server/README.md)
