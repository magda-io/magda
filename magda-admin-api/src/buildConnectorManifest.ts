export type Options = {
    id: string;
    dockerImage: string;
    dockerImageTag: string;
    dockerRepo: string;
    registryApiUrl: string;
    pullPolicy: string;
    interactive?: boolean;
};

export default function buildConnectorManifest({
    id,
    dockerImage,
    dockerImageTag,
    dockerRepo,
    registryApiUrl,
    pullPolicy,
    interactive = false
}: Options) {
    const jobName = interactive ? `connector-interactive-${id}` : `connector-${id}`;

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
                                registryApiUrl,
                                ...interactive ? ['--interactive', '--listenPort', '80', '--timeout', '1800'] : []
                            ],
                            imagePullPolicy: pullPolicy,
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
