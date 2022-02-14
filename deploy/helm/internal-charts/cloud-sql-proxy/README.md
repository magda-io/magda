# cloud-sql-proxy

![Version: 1.2.0-rc.0](https://img.shields.io/badge/Version-1.2.0--rc.0-informational?style=flat-square) ![AppVersion: 1.11](https://img.shields.io/badge/AppVersion-1.11-informational?style=flat-square)

A Helm chart for Kubernetes

## Requirements

Kubernetes: `>= 1.14.0-0`

### Requried Secret

`cloud-sql-proxy` requires a secret named `cloudsql-instance-credentials` to be created with key `credentials.json` contains
the Google cloud service account JSON key that has access to the CloudSQL instance.

You can create the rquired secret with:

```bash
kubectl -n [Magda Deploy Namespace] create secret generic cloudsql-instance-credentials --from-file=credentials.json=[local path to service account JSON key file]
```

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| autoscaler.enabled | bool | `false` |  |
| autoscaler.maxReplicas | int | `3` |  |
| autoscaler.minReplicas | int | `1` |  |
| autoscaler.targetCPUUtilizationPercentage | int | `80` |  |
| enableIamLogin | bool | false | Enables the proxy to use Cloud SQL IAM database authentication. Available from docker image 1.23.0 |
| global | object | `{}` |  |
| image.name | string | `"gce-proxy"` |  |
| image.pullPolicy | string | `"IfNotPresent"` |  |
| image.pullSecrets | bool | `false` |  |
| image.repository | string | `"gcr.io/cloudsql-docker"` |  |
| image.tag | string | `"1.11"` |  |
| ipAddressTypes | string | PUBLIC,PRIVATE | A comma-delimited list of preferred IP types for connecting to an instance.  For example, setting this to PRIVATE will force the proxy to connect to instances using an instance's associated private IP. Available from docker image 1.23.0 |
| logDebugStdout | bool | false | This is to log non-error output to standard out instead of standard error.  For example, if you don't want connection related messages to log as errors, set this flag to true. Available from docker image 1.23.0 |
| maxConnections | int | 0 (no limit). | If provided, the maximum number of connections to establish before refusing new connections.  Available from docker image 1.23.0 |
| replicas | string | `nil` | no. of replicas required for the deployment. If not set, k8s will assume `1` but allows HPA (autoscaler) alters it. @default 1 |
| resources.requests.cpu | string | `"50m"` |  |
| resources.requests.memory | string | `"50Mi"` |  |
| skipFailedInstanceConfig | bool | false | Setting this flag will prevent the proxy from terminating if any errors occur during instance configuration.  Please note that this means some instances may fail to be set up correctly while others may work if the proxy restarts. Available from docker image 1.23.0 |
| structuredLogs | bool | false | Writes all logging output as JSON with the following keys: level, ts, caller, msg. Available from docker image 1.23.0 |
| termTimeout | int | 0 | How long (in seconds) to wait for connections to close before shutting down the proxy. Available from docker image 1.23.0 |
