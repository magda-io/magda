# magda-common

![Version: 4.2.3](https://img.shields.io/badge/Version-4.2.3-informational?style=flat-square) ![Type: library](https://img.shields.io/badge/Type-library-informational?style=flat-square)

A Library Helm Chart for sharing common Magda logic between charts.
This chart is not deployable by itself.

Magda developers can add this library to chart `dependencies` list to leverage common deployment logic.
e.g.:
```yaml
dependencies:
  - name: magda-common
    version: "2.1.1"
    repository: "oci://ghcr.io/magda-io/charts"
```

## Source Code

* <https://github.com/magda-io/magda/tree/master/deploy/helm/internal-charts/common>
* <https://github.com/magda-io/magda>

## Requirements

Kubernetes: `>= 1.14.0-0`

