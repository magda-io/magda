export type Options = {
    id: string;
    dockerImage: string;
    dockerImageTag: string;
    dockerRepo: string;
    registryApiUrl: string;
    pullPolicy: string;
    userId: string;
    tenantId: number;
    interactive?: boolean;
};

export default function buildConnectorManifest({
    id,
    dockerImage,
    dockerImageTag,
    dockerRepo,
    registryApiUrl,
    pullPolicy,
    userId,
    tenantId,
    interactive = false
}: Options) {
    const jobName = interactive
        ? `connector-interactive-${id}`
        : `connector-${id}`;

    return {
        apiVersion: "batch/v1",
        kind: "Job",
        metadata: {
            name: jobName,
            magdaMinion: true
        },
        spec: {
            template: {
                metadata: {
                    name: jobName,
                    magdaMinion: true
                },
                spec: {
                    containers: [
                        {
                            name: jobName,
                            image: `${dockerRepo}/${dockerImage}:${dockerImageTag}`,
                            command: [
                                "node",
                                "/usr/src/app/component/dist/index.js",
                                "--config",
                                "/etc/config/connector.json",
                                "--registryUrl",
                                registryApiUrl,
                                "--tenantId",
                                tenantId.toString(),
                                ...(interactive
                                    ? [
                                          "--interactive",
                                          "--listenPort",
                                          "80",
                                          "--timeout",
                                          "1800"
                                      ]
                                    : [])
                            ],
                            imagePullPolicy: pullPolicy,
                            resources: {
                                requests: {
                                    cpu: "50m"
                                }
                            },
                            volumeMounts: [
                                {
                                    mountPath: "/etc/config",
                                    name: "config"
                                }
                            ],
                            env: [
                                {
                                    name: "USER_ID",
                                    value: userId
                                },
                                {
                                    name: "JWT_SECRET",
                                    valueFrom: {
                                        secretKeyRef: {
                                            name: "auth-secrets",
                                            key: "jwt-secret"
                                        }
                                    }
                                }
                            ]
                        }
                    ],
                    restartPolicy: "OnFailure",
                    volumes: [
                        {
                            name: "config",
                            configMap: {
                                name: `connector-config`,
                                items: [
                                    {
                                        key: `${id}.json`,
                                        path: "connector.json"
                                    }
                                ]
                            }
                        }
                    ]
                }
            }
        }
    };
}
