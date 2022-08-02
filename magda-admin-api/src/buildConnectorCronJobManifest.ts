import k8s from "@kubernetes/client-node";
import connectorObjName from "./connectorObjName";

function buildConnectorCronJobManifest(options: {
    id: string;
    namespace: string;
    registryApiUrl: string;
    tenantId: number;
    defaultUserId: string;
    schedule: string;
    dockerImageString?: string;
    dockerImageName?: string;
    dockerImageTag?: string;
    dockerRepo?: string;
    pullPolicy?: string;
}): k8s.V1CronJob {
    const connectorObjectName = connectorObjName(options.id);

    const cronJob = new k8s.V1CronJob();
    cronJob.apiVersion = "batch/v1";
    cronJob.kind = "CronJob";
    cronJob.metadata = new k8s.V1ObjectMeta();
    cronJob.metadata.name = connectorObjectName;
    cronJob.metadata.namespace = options.namespace;
    cronJob.metadata.labels = {
        "app.kubernetes.io/managed-by": "Magda"
    };
    cronJob.spec = {
        concurrencyPolicy: "Forbid",
        failedJobsHistoryLimit: 1,
        jobTemplate: {
            spec: {
                template: {
                    metadata: {
                        name: connectorObjectName
                    },
                    spec: {
                        containers: [
                            {
                                command: [
                                    "node",
                                    "/usr/src/app/component/dist/index.js",
                                    "--tenantId",
                                    options.tenantId.toString(),
                                    "--config",
                                    "/etc/config/config.json",
                                    "--registryUrl",
                                    options.registryApiUrl
                                ],
                                env: [
                                    {
                                        name: "USER_ID",
                                        value: options.defaultUserId
                                    },
                                    {
                                        name: "JWT_SECRET",
                                        valueFrom: {
                                            secretKeyRef: {
                                                key: "jwt-secret",
                                                name: "auth-secrets"
                                            }
                                        }
                                    }
                                ],
                                image: options.dockerImageString
                                    ? options.dockerImageString
                                    : `${options.dockerRepo}/${options.dockerImageName}:${options.dockerImageTag}`,
                                imagePullPolicy: options?.pullPolicy
                                    ? options.pullPolicy
                                    : "IfNotPresent",
                                name: connectorObjectName,
                                resources: {
                                    limits: {
                                        cpu: "100m"
                                    },
                                    requests: {
                                        cpu: "50m",
                                        memory: "30Mi"
                                    }
                                },
                                volumeMounts: [
                                    {
                                        mountPath: "/etc/config",
                                        name: "config"
                                    }
                                ]
                            }
                        ],
                        volumes: [
                            {
                                configMap: {
                                    items: [
                                        {
                                            key: "config.json",
                                            path: "config.json"
                                        }
                                    ],
                                    name: connectorObjectName
                                },
                                name: "config"
                            }
                        ]
                    }
                }
            }
        },
        schedule: options.schedule,
        successfulJobsHistoryLimit: 3,
        suspend: false
    };

    return cronJob;
}

export default buildConnectorCronJobManifest;
