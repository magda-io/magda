# opensearch

![Version: 5.5.0-alpha.1](https://img.shields.io/badge/Version-5.5.0--alpha.1-informational?style=flat-square)

A Helm chart for Magda's OpenSearch Cluster

## Requirements

Kubernetes: `>= 1.23.0-0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| client | object | `{"affinity":{},"autoscaling":{"hpa":{"enabled":false,"maxReplicas":11,"minReplicas":3,"targetCPU":90,"targetMemory":""}},"enabled":false,"envFrom":[],"extraContainers":[],"extraEnvs":[],"extraInitContainers":[],"extraVolumeMounts":[],"extraVolumes":[],"fullnameOverride":"","javaOpts":"-Xmx256M -Xms256M","livenessProbe":{},"nameOverride":"","nodeSelector":{},"pluginsInstall":"","podAnnotations":{},"priorityClassName":"magda-9","readinessProbe":{},"replicas":1,"resources":{"requests":{"cpu":"50m","memory":"512Mi"}},"startupProbe":{},"sysctlVmMaxMapCount":null,"terminationGracePeriod":120,"tolerations":[]}` | client node group options. Nodes in this group will have `Ingest` & `Coordinating` roles. For production use cases, it is recommended to turn on client node group and have at least 2 client nodes. |
| client.enabled | bool | `false` | By default, client node group is disabled. For production use cases, it is recommended to turn on client node group. |
| client.priorityClassName | string | `"magda-9"` | Will only be used if .Values.global.enablePriorityClass is set to true |
| client.sysctlVmMaxMapCount | string | `nil` | By default, .Values.sysctlVmMaxMapCount will be used. You can overwrite this value for client node group. |
| clusterName | string | `"opensearch"` |  |
| config | string | `nil` |  |
| dashboards.enabled | bool | `true` |  |
| dashboards.podAnnotations | object | `{}` |  |
| dashboardsImage.name | string | `"magda-opensearch-dashboards"` |  |
| data | object | `{"affinity":{"podAntiAffinity":{"preferredDuringSchedulingIgnoredDuringExecution":[{"podAffinityTerm":{"labelSelector":{"matchExpressions":[{"key":"component","operator":"In","values":["opensearch"]},{"key":"role","operator":"In","values":["data"]}]},"topologyKey":"kubernetes.io/hostname"},"weight":50}]}},"envFrom":[],"extraContainers":[],"extraEnvs":[],"extraInitContainers":[],"extraVolumeMounts":[],"extraVolumes":[],"fullnameOverride":"","javaOpts":"-Xmx512M -Xms512M","livenessProbe":{},"nameOverride":"","nodeSelector":{},"pluginsInstall":"","podAnnotations":{},"priorityClassName":"magda-9","readinessProbe":{},"replicas":1,"resources":{"requests":{"cpu":"200m","memory":"1024Mi"}},"startupProbe":{},"storage":"50Gi","sysctlVmMaxMapCount":null,"terminationGracePeriod":120,"tolerations":[]}` | Data node group options Nodes in this group will have `Data` & `Coordinating` roles. For production use cases, it is recommended to turn on client node group and have at least 2 client nodes. Data node group will always be enabled. when `client` is disabled, `data` node group will have additional `Ingest` role. when `master` is disabled, `data` node group will have additional `Master` role. |
| data.priorityClassName | string | `"magda-9"` | Will only be used if .Values.global.enablePriorityClass is set to true |
| data.storage | string | `"50Gi"` | Size of the persistent volume claim for each data node. |
| data.sysctlVmMaxMapCount | string | `nil` | By default, .Values.sysctlVmMaxMapCount will be used. You can overwrite this value for data node group. |
| defaultImage.pullPolicy | string | `"IfNotPresent"` |  |
| defaultImage.pullSecrets | bool | `false` |  |
| defaultImage.repository | string | `"ghcr.io/magda-io"` |  |
| enableServiceLinks | bool | `true` | The environment variables injected by service links are not used, but can lead to slow OpenSearch boot times when there are many services in the current namespace. If you experience slow pod startups you probably want to set this to `false`. |
| envFrom | list | `[]` | Allows you to load environment variables from kubernetes secret or config map e.g.  - secretRef:     name: env-secret - configMapRef:     name: config-map You can overwrite `envFrom` for each node type (master, data, client) via the `envFrom` property in each node type. |
| extraContainers | list | `[]` |  |
| extraEnvs | list | `[]` | Extra environment variables to append to this nodeGroup This will be appended to the current 'env:' key. You can use any of the kubernetes env syntax here. e.g. extraEnvs: - name: MY_ENVIRONMENT_VAR   value: the_value_goes_here You can overwrite `extraEnvs` for each node type (master, data, client) via the `extraEnvs` property in each node type. |
| extraInitContainers | list | `[]` |  |
| extraVolumeMounts | list | `[]` |  |
| extraVolumes | list | `[]` |  |
| global.rollingUpdate | object | `{}` |  |
| hostAliases | list | `[]` |  |
| httpHostPort | string | `""` |  |
| httpPort | int | `9200` |  |
| image.name | string | `"magda-opensearch"` |  |
| initContainerImage.name | string | `"busybox"` |  |
| initContainerImage.pullPolicy | string | `"IfNotPresent"` |  |
| initContainerImage.repository | string | `"docker.io"` |  |
| initContainerImage.tag | string | `"latest"` |  |
| initResources | object | `{"limits":{"cpu":"25m","memory":"128Mi"},"requests":{"cpu":"25m","memory":"128Mi"}}` | resources config set for init container |
| javaOpts | string | `"-Xmx256M -Xms256M"` | Opensearch Java options for all node types You can overwrite `javaOpts` for each node type (master, data, client) via the `javaOpts` property in each node type. |
| keystore | list | `[]` |  |
| lifecycle | object | `{}` |  |
| livenessProbe.failureThreshold | int | `10` |  |
| livenessProbe.initialDelaySeconds | int | `10` |  |
| livenessProbe.periodSeconds | int | `20` |  |
| livenessProbe.successThreshold | int | `1` |  |
| livenessProbe.tcpSocket.port | string | `"transport"` |  |
| livenessProbe.timeoutSeconds | int | `5` |  |
| master | object | `{"affinity":{},"enabled":false,"envFrom":[],"extraContainers":[],"extraEnvs":[],"extraInitContainers":[],"extraVolumeMounts":[],"extraVolumes":[],"fullnameOverride":"","javaOpts":"-Xmx256M -Xms256M","livenessProbe":{},"nameOverride":"","nodeSelector":{},"pluginsInstall":"","podAnnotations":{},"priorityClassName":"magda-9","readinessProbe":{"failureThreshold":3,"initialDelaySeconds":30,"periodSeconds":10,"tcpSocket":{"port":"transport"},"timeoutSeconds":5},"replicas":3,"resources":{"requests":{"cpu":"50m","memory":"512Mi"}},"startupProbe":{},"storage":"8Gi","sysctlVmMaxMapCount":null,"terminationGracePeriod":120,"tolerations":[]}` | Master node group options Nodes in this group will have `Master` & `Coordinating` roles. For production use cases, it is recommended to turn on master node group and have at least 3 master nodes across different availability zones. |
| master.enabled | bool | `false` | By default, Master node group is disabled. For production use cases, it is recommended to turn on Master node group. |
| master.priorityClassName | string | `"magda-9"` | Will only be used if .Values.global.enablePriorityClass is set to true |
| master.storage | string | `"8Gi"` | Size of the persistent volume claim for each master node. |
| master.sysctlVmMaxMapCount | string | `nil` | By default, .Values.sysctlVmMaxMapCount will be used. You can overwrite this value for master node group. |
| masterTerminationFix | bool | `true` | Use a sidecar container to prevent slow master re-election |
| metricsPort | int | `9600` |  |
| networkHost | string | `"0.0.0.0"` |  |
| opensearchHome | string | `"/usr/share/opensearch"` | Allows you to add any config files in {{ .Values.opensearchHome }}/config |
| persistence.accessModes[0] | string | `"ReadWriteOnce"` |  |
| persistence.enableInitChown | bool | `false` | Set to true to enable the `fsgroup-volume` initContainer that will update permissions on the persistent disk using `chown`. |
| persistence.storageClass | string | `nil` | Storage class of the persistent volume claim for data & master nodes |
| plugins.enabled | bool | `false` |  |
| plugins.installList | list | `[]` |  |
| podManagementPolicy | string | `"Parallel"` | The default is to deploy all pods serially. By setting this to parallel all pods are started at the same time when bootstrapping the cluster |
| podSecurityContext.fsGroup | int | `1000` |  |
| podSecurityContext.fsGroupChangePolicy | string | `"OnRootMismatch"` | By default, Kubernetes recursively changes ownership and permissions for the contents of each volume to match the fsGroup specified in a Pod's securityContext when that volume is mounted. For large volumes,  checking and changing ownership and permissions can take a lot of time, slowing Pod startup.  You can set the fsGroupChangePolicy field to `OnRootMismatch` to make it only change permissions and ownership if the permission and the ownership of root directory does not match with expected permissions of the volume.  `fsGroupChangePolicy` is a beta feature introduced in Kubernetes 1.20 and become GA in Kubernetes 1.23. |
| podSecurityContext.runAsUser | int | `1000` |  |
| rbac.automountServiceAccountToken | bool | `false` | Controls whether or not the Service Account token is automatically mounted to /var/run/secrets/kubernetes.io/serviceaccount |
| rbac.create | bool | `false` |  |
| rbac.serviceAccountAnnotations | object | `{}` |  |
| rbac.serviceAccountName | string | `""` |  |
| readinessProbe.failureThreshold | int | `3` |  |
| readinessProbe.httpGet.path | string | `"/_cluster/health?local=true"` |  |
| readinessProbe.httpGet.port | string | `"http"` |  |
| readinessProbe.initialDelaySeconds | int | `30` |  |
| readinessProbe.periodSeconds | int | `10` |  |
| readinessProbe.timeoutSeconds | int | `5` |  |
| schedulerName | string | `""` | Use an alternate scheduler. ref: https://kubernetes.io/docs/tasks/administer-cluster/configure-multiple-schedulers/ |
| securityContext.capabilities.drop[0] | string | `"ALL"` |  |
| securityContext.runAsNonRoot | bool | `true` |  |
| securityContext.runAsUser | int | `1000` |  |
| service.externalTrafficPolicy | string | `""` |  |
| service.ipFamilies | string | `nil` | IP family requires Kubernetes v1.23+ |
| service.ipFamilyPolicy | string | `"SingleStack"` | The IP family and IP families options are to set the behaviour in a dual-stack environment Omitting these values will let the service fall back to whatever the CNI dictates the defaults should be. requires Kubernetes v1.23+ |
| service.loadBalancerIP | string | `""` |  |
| service.loadBalancerSourceRanges | list | `[]` |  |
| service.type | string | `"ClusterIP"` |  |
| sidecarResources | object | `{"limits":{"cpu":"25m","memory":"128Mi"},"requests":{"cpu":"25m","memory":"128Mi"}}` | resources config set for sidecar container |
| startupProbe.failureThreshold | int | `30` |  |
| startupProbe.initialDelaySeconds | int | `30` |  |
| startupProbe.periodSeconds | int | `10` |  |
| startupProbe.tcpSocket.port | string | `"transport"` |  |
| startupProbe.timeoutSeconds | int | `3` |  |
| sysctl.enabled | bool | `true` | Enable setting optimal sysctl settings on the node. |
| sysctl.fsFileMax | int | `65536` |  |
| sysctl.method | string | `"initContainer"` | How to set optimal sysctl settings. Possible values:  - `initContainer`: set optimal sysctl's through privileged initContainer (i.e. `privileged: true`). - `securityContext`: set optimal sysctl's through securityContext. This requires privilege. Default to `initContainer`. Please note: When use `securityContext`, you need to make sure unsafe sysctls (e.g. `vm.max_map_count`) are enabled on the node. All unsafe sysctls are disabled by default and must be allowed manually by the cluster admin on a per-node basis. Also see: https://kubernetes.io/docs/tasks/administer-cluster/sysctl-cluster/ |
| sysctl.vmMaxMapCount | int | `262144` | Opensearch uses a mmapfs directory by default to store its indices.  The default operating system limits on mmap counts is likely to be too low, which may result in out of memory exceptions. |
| transportHostPort | string | `""` |  |
| transportPort | int | `9300` |  |
| updateStrategy | string | `"RollingUpdate"` |  |

----------------------------------------------
Autogenerated from chart metadata using [helm-docs v1.13.1](https://github.com/norwoodj/helm-docs/releases/v1.13.1)
