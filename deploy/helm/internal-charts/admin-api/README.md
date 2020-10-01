# admin-api

![Version: 0.0.58-rc.2](https://img.shields.io/badge/Version-0.0.58-rc.2-informational?style=flat-square)

A Helm chart for Kubernetes

## Requirements

Kubernetes: `>= 1.14.0-0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| image | object | `{}` |  |
| resources.requests.cpu | string | `"50m"` |  |
| resources.requests.memory | string | `"50Mi"` |  |
