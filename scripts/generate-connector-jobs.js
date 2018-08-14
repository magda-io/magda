#!/usr/bin/env node
const fs = require("fs-extra");
const klawSync = require("klaw-sync");
const path = require("path");
const yargs = require("yargs");

const argv = yargs
    .config()
    .help()
    .option("in", {
        describe:
            "The directory containing the connector configuration JSON files.",
        type: "string",
        demandOption: true
    })
    .option("out", {
        describe:
            "The directory in which to write the generated Kubernetes config files.",
        type: "string",
        demandOption: true
    })
    .option("local", {
        describe:
            "true to generate config files for a Minikube deployment with the registry on localhost:5000 and the version at latest.  Otherwise, the default registry and the version in the connector's package.json are used.",
        type: "boolean",
        default: false
    })
    .option("prod", {
        describe:
            "Whether to use values appropriate for a dev cluster or a prod cluster",
        type: "boolean",
        default: false
    })
    .option("imageVersion", {
        describe:
            "Overrides the version of the image that will be given to the jobs. Defaults to 'latest' if 'local' is specified, otherwise it will match the version of this package.",
        type: "string"
    })
    .option("imagePrefix", {
        describe:
            "Overrides the prefix for the image that will be given to the jobs. Defaults to 'localhost:5000/data61' if 'local' is specified, otherwise data61/",
        type: "string"
    }).argv;

fs.ensureDirSync(argv.out);

const files = klawSync(argv.in, { nodir: true });
files.forEach(function(connectorConfigFile) {
    const configFile = JSON.parse(
        fs.readFileSync(connectorConfigFile.path, "utf8")
    );
    const connectorPackageName = configFile.type;
    const connectorPackagePath = path.join("..", connectorPackageName);
    const connectorPackageJson = JSON.parse(
        fs.readFileSync(path.join(connectorPackagePath, "package.json"), "utf8")
    );

    function getImageVersion() {
        if (argv.imageVersion) {
            return argv.imageVersion;
        } else if (argv.local) {
            return "latest";
        } else {
            return connectorPackageJson.version;
        }
    }

    function getImagePrefix() {
        if (argv.imagePrefix) {
            return argv.imagePrefix;
        } else if (argv.local) {
            return "localhost:5000/data61/";
        } else {
            return "data61/";
        }
    }

    const image = getImagePrefix() + configFile.type + ":" + getImageVersion();
    const prod = argv.prod;

    const basename = path.basename(connectorConfigFile.path, ".json");

    const jobSpec = {
        template: {
            metadata: {
                name: "connector-" + basename
            },
            spec: {
                containers: [
                    {
                        name: "connector-" + basename,
                        image: image,
                        command: [
                            "node",
                            "/usr/src/app/component/dist/index.js",
                            "--config",
                            "/etc/config/connector.json",
                            "--registryUrl",
                            "http://registry-api/v0"
                        ],
                        imagePullPolicy: prod ? "IfNotPresent" : "Always",
                        resources: {
                            requests: {
                                cpu: prod ? "500m" : "500m",
                                memory: prod ? "500Mi" : "500Mi"
                            },
                            limits: {
                                cpu: prod ? "1000m" : "500m"
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
                                value: "00000000-0000-4000-8000-000000000000"
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
                            name: "connector-config",
                            items: [
                                {
                                    key: path.basename(
                                        connectorConfigFile.path
                                    ),
                                    path: "connector.json"
                                }
                            ]
                        }
                    }
                ]
            }
        }
    };

    const job = {
        apiVersion: "batch/v1",
        kind: "Job",
        metadata: {
            name: "connector-" + basename
        },
        spec: jobSpec
    };

    fs.writeFileSync(
        path.join(argv.out, "connector-" + basename + ".json"),
        JSON.stringify(job, undefined, "  "),
        "utf8"
    );

    const cron = {
        apiVersion: "batch/v1beta1",
        kind: "CronJob",
        metadata: {
            name: "connector-" + basename
        },
        spec: {
            schedule:
                configFile.schedule && prod
                    ? configFile.schedule
                    : "0 14 * * 6", // 12am Sydney time on Sunday
            jobTemplate: {
                spec: jobSpec
            }
        }
    };

    fs.writeFileSync(
        path.join(argv.out, "connector-" + basename + "-cron.json"),
        JSON.stringify(cron, undefined, "  "),
        "utf8"
    );
});
