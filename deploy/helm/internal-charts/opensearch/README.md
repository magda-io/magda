# opensearch

![Version: 3.0.0-alpha.2](https://img.shields.io/badge/Version-3.0.0--alpha.2-informational?style=flat-square)

A Helm chart for Kubernetes

## Requirements

Kubernetes: `>= 1.14.0-0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| backup.googleApplicationCreds | object | `{}` |  |
| client | object | `{"enabled":false,"envFrom":[],"extraEnvs":[],"heapSize":"256m","javaOpts":"-Xmx512M -Xms512M","pluginsInstall":"","replicas":1,"resources":{"limits":{"cpu":"100m"},"requests":{"cpu":"50m","memory":"500Mi"}},"secretMounts":[]}` | client node group options. Nodes in this group will have `Ingest` & `Coordinating` roles. For production use cases, it is recommended to turn on client node group and have at least 2 client nodes. |
| client.enabled | bool | `false` | By default, client node group is disabled. For production use cases, it is recommended to turn on client node group. |
| config."opensearch.yml" | string | `"cluster.name: opensearch-cluster\n\n# Bind to all interfaces because we don't know what IP address Docker will assign to us.\nnetwork.host: 0.0.0.0\n\n# Setting network.host to a non-loopback address enables the annoying bootstrap checks. \"Single-node\" mode disables them again.\n# Implicitly done if \".singleNode\" is set to \"true\".\n# discovery.type: single-node\n\n# Start OpenSearch Security Demo Configuration\n# WARNING: revise all the lines below before you go into production\nplugins:\n  security:\n    ssl:\n      transport:\n        pemcert_filepath: esnode.pem\n        pemkey_filepath: esnode-key.pem\n        pemtrustedcas_filepath: root-ca.pem\n        enforce_hostname_verification: false\n      http:\n        enabled: true\n        pemcert_filepath: esnode.pem\n        pemkey_filepath: esnode-key.pem\n        pemtrustedcas_filepath: root-ca.pem\n    allow_unsafe_democertificates: true\n    allow_default_init_securityindex: true\n    authcz:\n      admin_dn:\n        - CN=kirk,OU=client,O=client,L=test,C=de\n    audit.type: internal_opensearch\n    enable_snapshot_restore_privilege: true\n    check_snapshot_restore_write_privileges: true\n    restapi:\n      roles_enabled: [\"all_access\", \"security_rest_api_access\"]\n    system_indices:\n      enabled: true\n      indices:\n        [\n          \".opendistro-alerting-config\",\n          \".opendistro-alerting-alert*\",\n          \".opendistro-anomaly-results*\",\n          \".opendistro-anomaly-detector*\",\n          \".opendistro-anomaly-checkpoints\",\n          \".opendistro-anomaly-detection-state\",\n          \".opendistro-reports-*\",\n          \".opendistro-notifications-*\",\n          \".opendistro-notebooks\",\n          \".opendistro-asynchronous-search-response*\",\n        ]\n######## End OpenSearch Security Demo Configuration ########\n"` |  |
| data | object | `{"envFrom":[],"extraEnvs":[],"heapSize":"256m","javaOpts":"-Xmx512M -Xms512M","pluginsInstall":"","resources":{"limits":{"cpu":"500m"},"requests":{"cpu":"200m","memory":"500Mi"}},"secretMounts":[],"storage":"50Gi"}` | Data node group options Nodes in this group will have `Data` & `Coordinating` roles. For production use cases, it is recommended to turn on client node group and have at least 2 client nodes. Data node group will always be enabled. when `client` is disabled, `data` node group will have additional `Ingest` role. when `master` is disabled, `data` node group will have additional `Master` role. |
| defaultImage.pullPolicy | string | `"IfNotPresent"` |  |
| defaultImage.pullSecrets | bool | `false` |  |
| defaultImage.repository | string | `"docker.io/data61"` |  |
| envFrom | list | `[]` | Allows you to load environment variables from kubernetes secret or config map e.g.  - secretRef:     name: env-secret - configMapRef:     name: config-map You can overwrite `envFrom` for each node type (master, data, client) via the `envFrom` property in each node type. |
| extraEnvs | list | `[]` | Extra environment variables to append to this nodeGroup This will be appended to the current 'env:' key. You can use any of the kubernetes env syntax here. e.g. extraEnvs: - name: MY_ENVIRONMENT_VAR   value: the_value_goes_here You can overwrite `extraEnvs` for each node type (master, data, client) via the `extraEnvs` property in each node type. |
| image.name | string | `"magda-opensearch"` |  |
| initContainerImage.name | string | `"busybox"` |  |
| initContainerImage.pullPolicy | string | `"IfNotPresent"` |  |
| initContainerImage.repository | string | `"docker.io"` |  |
| initContainerImage.tag | string | `"latest"` |  |
| initResources | object | `{}` | resources config set for init container |
| javaOpts | string | `"-Xmx512M -Xms512M"` | Opensearch Java options for all node types You can overwrite `javaOpts` for each node type (master, data, client) via the `javaOpts` property in each node type. |
| kibanaImage.name | string | `"kibana-oss"` |  |
| kibanaImage.pullPolicy | string | `"IfNotPresent"` |  |
| kibanaImage.pullSecrets | bool | `false` |  |
| kibanaImage.repository | string | `"docker.elastic.co/kibana"` |  |
| kibanaImage.tag | string | `"6.8.22"` |  |
| master | object | `{"enabled":false,"envFrom":[],"extraEnvs":[],"javaOpts":"-Xmx512M -Xms512M","pluginsInstall":"","replicas":3,"resources":{"limits":{"cpu":"100m"},"requests":{"cpu":"50m","memory":"900Mi"}},"secretMounts":[]}` | Master node group options Nodes in this group will have `Master` & `Coordinating` roles. For production use cases, it is recommended to turn on master node group and have at least 3 master nodes across different availability zones. |
| master.enabled | bool | `false` | By default, Master node group is disabled. For production use cases, it is recommended to turn on Master node group. |
| opensearchHome | string | `"/usr/share/opensearch"` | Allows you to add any config files in {{ .Values.opensearchHome }}/config |
| secretMounts | list | `[]` | A list of secrets and their paths to mount inside the pod This is useful for mounting certificates for security and for mounting the X-Pack license You can overwrite `secretMounts` for each node type (master, data, client) via the `secretMounts` property in each node type. |
| sidecarResources | object | `{}` | resources config set for sidecar container |

----------------------------------------------
Autogenerated from chart metadata using [helm-docs v1.5.0](https://github.com/norwoodj/helm-docs/releases/v1.5.0)
