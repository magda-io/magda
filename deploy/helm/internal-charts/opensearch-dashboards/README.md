# opensearch-dashboards

![Version: 6.0.0-alpha.11](https://img.shields.io/badge/Version-6.0.0--alpha.11-informational?style=flat-square)

A Helm chart for OpenSearch dashboards. To make the service accessible externally, please refer to [this doc](https://github.com/magda-io/magda/blob/main/docs/docs/how-to-expose-opensearch-dashboards.md)

## Requirements

Kubernetes: `>= 1.23.0-0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| affinity | object | `{}` |  |
| autoscaling.hpa.enabled | bool | `false` |  |
| autoscaling.hpa.maxReplicas | int | `11` |  |
| autoscaling.hpa.minReplicas | int | `3` |  |
| autoscaling.hpa.targetCPU | int | `90` |  |
| autoscaling.hpa.targetMemory | string | `""` |  |
| config | object | `{}` | Default OpenSearch Dashboards configuration from docker image of Dashboards example: opensearch_dashboards.yml: |   server:     name: dashboards     host: "{{ .Values.serverHost }}" opensearch_dashboards.yml:   server:     name: dashboards     host: "0.0.0.0" More config options. See comments in https://github.com/opensearch-project/OpenSearch-Dashboards/blob/main/config/opensearch_dashboards.yml |
| defaultImage.pullPolicy | string | `"IfNotPresent"` |  |
| defaultImage.pullSecrets | bool | `false` |  |
| defaultImage.repository | string | `"ghcr.io/magda-io"` |  |
| deploymentAnnotations | object | `{}` |  |
| envFrom | list | `[]` |  |
| extraContainers | string | `""` |  |
| extraEnvs | list | `[]` |  |
| extraInitContainers | string | `""` |  |
| extraVolumeMounts | list | `[]` |  |
| extraVolumes | list | `[]` |  |
| fullnameOverride | string | `""` |  |
| global.rollingUpdate | object | `{}` |  |
| hostAliases | list | `[]` |  |
| image.name | string | `"magda-opensearch-dashboards"` |  |
| initContainerImage.name | string | `"busybox"` |  |
| initContainerImage.pullPolicy | string | `"IfNotPresent"` |  |
| initContainerImage.repository | string | `"docker.io"` |  |
| initContainerImage.tag | string | `"latest"` |  |
| lifecycle | object | `{}` | pod lifecycle policies as outlined here: https://kubernetes.io/docs/concepts/containers/container-lifecycle-hooks/#container-hooks |
| livenessProbe.failureThreshold | int | `10` |  |
| livenessProbe.initialDelaySeconds | int | `10` |  |
| livenessProbe.periodSeconds | int | `20` |  |
| livenessProbe.successThreshold | int | `1` |  |
| livenessProbe.tcpSocket.port | int | `5601` |  |
| livenessProbe.timeoutSeconds | int | `5` |  |
| nameOverride | string | `""` |  |
| nodeSelector | object | `{}` |  |
| opensearchAccount.keyPassphrase.enabled | bool | `false` |  |
| opensearchAccount.secret | string | `""` |  |
| opensearchDashboardsYml.defaultMode | string | `nil` |  |
| opensearchHosts | list | `["http://opensearch:9200"]` | the opensearchHosts is a list of OpenSearch hosts that the OpenSearch Dashboards instance will connect to |
| plugins | object | `{"enabled":false,"installList":[]}` | Enable to add 3rd Party / Custom plugins not offered in the default OpenSearchDashboards image. |
| podAnnotations | object | `{}` |  |
| podSecurityContext.runAsUser | int | `1000` |  |
| priorityClassName | string | `"magda-0"` |  |
| rbac.automountServiceAccountToken | bool | `false` | Controls whether or not the Service Account token is automatically mounted to /var/run/secrets/kubernetes.io/serviceaccount |
| rbac.create | bool | `false` |  |
| rbac.serviceAccountAnnotations | object | `{}` |  |
| rbac.serviceAccountName | string | `""` |  |
| readinessProbe.failureThreshold | int | `10` |  |
| readinessProbe.initialDelaySeconds | int | `10` |  |
| readinessProbe.periodSeconds | int | `20` |  |
| readinessProbe.successThreshold | int | `1` |  |
| readinessProbe.tcpSocket.port | int | `5601` |  |
| readinessProbe.timeoutSeconds | int | `5` |  |
| replicas | int | `1` |  |
| resources.limits.cpu | string | `"100m"` |  |
| resources.limits.memory | string | `"512M"` |  |
| resources.requests.cpu | string | `"100m"` |  |
| resources.requests.memory | string | `"512M"` |  |
| serverHost | string | `"0.0.0.0"` |  |
| service.annotations | object | `{}` |  |
| service.httpPortName | string | `"http"` |  |
| service.labels | object | `{}` |  |
| service.loadBalancerIP | string | `""` |  |
| service.loadBalancerSourceRanges | list | `[]` |  |
| service.name | string | `"opensearch-dashboards"` |  |
| service.nodePort | string | `""` |  |
| service.port | int | `5601` |  |
| service.type | string | `"ClusterIP"` |  |
| startupProbe.failureThreshold | int | `20` |  |
| startupProbe.initialDelaySeconds | int | `10` |  |
| startupProbe.periodSeconds | int | `10` |  |
| startupProbe.successThreshold | int | `1` |  |
| startupProbe.tcpSocket.port | int | `5601` |  |
| startupProbe.timeoutSeconds | int | `5` |  |
| tolerations | list | `[]` |  |
| topologySpreadConstraints | list | `[]` | This is the pod topology spread constraints https://kubernetes.io/docs/concepts/workloads/pods/pod-topology-spread-constraints/ |

----------------------------------------------
Autogenerated from chart metadata using [helm-docs v1.13.1](https://github.com/norwoodj/helm-docs/releases/v1.13.1)
