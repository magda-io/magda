# apidocs-server

![Version: 0.0.58-rc.0](https://img.shields.io/badge/Version-0.0.58-rc.0-informational?style=flat-square)

A Helm chart for Kubernetes

## Requirements

Kubernetes: `>= 1.14.0-0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| image | object | `{}` |  |
| resources.limits.cpu | string | `"20m"` |  |
| resources.requests.cpu | string | `"10m"` |  |
| resources.requests.memory | string | `"10Mi"` |  |
