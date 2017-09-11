export type Options = {
    id: string;
    dockerImage: string;
    dockerImageTag: string;
    dockerRepo: string;
    registryApiUrl: string;
};

export default function buildConnectorManifest({
    id,
    dockerImage,
    dockerImageTag,
    dockerRepo,
    registryApiUrl
}: Options) {
    const jobName = `connector-${id}`;

    return {
        apiVersion: "batch/v1",
        kind: "Job",
        metadata: {
            name: jobName,
            magdaSleuther: true
        },
        spec: {
            template: {
                metadata: {
                    name: jobName,
                    magdaSleuther: true
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
                                registryApiUrl
                            ],
                            imagePullPolicy:
                                dockerImageTag === "latest"
                                    ? "Always"
                                    : "IfNotPresent",
                            resources: {
                                requests: {
                                    cpu: "0m"
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
