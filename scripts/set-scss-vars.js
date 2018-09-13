#!/usr/bin/env node
const chalk = require("chalk");
const path = require("path");
const fse = require("fs-extra");
const childProcess = require("child_process");
const uniqid = require("uniqid");

const appName = "magda-create-secrets";
const pkg = require("./package.json");

const program = require("commander");

const COMPILER_CONFIG_MAP_NAME = "scss-compiler-config";
const COMPILER_CONFIG_MAP_KEY = "scssVars";
const CHECKING_INTERVAL = 10;

program
    .version(pkg.version)
    .usage("[options]")
    .description(
        `A tool for setting magda runtime UI scss variables. Version: ${
            pkg.version
        }`
    )
    .option(
        "-n, --namespace [k8s namespace]",
        "Specify the affecting k8s namespace. It's compulsory to avoid mistakes. \n" +
            "   e.g. ---namespace default \n"
    )
    .option(
        "-m, --minikube",
        "Set this switch if you want to update scss variables in a local minikube cluster. \n"
    )
    .option(
        "-f, --file [vars.json]",
        "A JSON file contains an object whose keys are scss variable name."
    );

program.parse(process.argv);

const programOptions = program.opts();

run(programOptions).catch(e => {
    console.error(chalk.red(`Failed to set SCSS variable: ${e}`));
    process.exit(1);
});

async function run(programOptions) {
    const [namespace, vars] = await validateProgramOptions(programOptions);
    const env = getEnvByClusterType(programOptions.isMinikube === true);
    checkIfKubectlValid(env);
    checkNamespace(env, namespace);
    const image = createConfigMap(env, namespace, COMPILER_CONFIG_MAP_NAME, {
        [COMPILER_CONFIG_MAP_KEY]: JSON.stringify(vars)
    });
    console.log(
        chalk.green(
            `Successfully created config \`${COMPILER_CONFIG_MAP_NAME}\` in namespace \`${namespace}\`.`
        )
    );
    console.log(
        chalk.yellow(`Creating updating job in namespace \`${namespace}\`...`)
    );
    const jobId = createJob(env, namespace, image);
    console.log(
        chalk.green(
            `Job \`${jobId}\` in namespace \`${namespace}\` has been created.`
        )
    );
    checkingJobProgress(env, namespace, jobId);
}

async function validateProgramOptions(options) {
    if (typeof options.namespace !== "string" || options.namespace == "") {
        throw new Error("Invalid `namespace` parameter.");
    }
    if (typeof options.file !== "string" || options.file == "") {
        throw new Error("Invalid `file` parameter.");
    }
    const filePath = path.resolve(options.file);
    if (!fse.existsSync(filePath)) {
        throw new Error("The path specified by `file` does not exsit.");
    }
    const fileData = fse.readJSONSync(filePath);
    if (typeof fileData !== "object") {
        throw new Error("Invalid JSON file content.");
    }
    return [options.namespace, fileData];
}

function getEnvByClusterType(isMinikube = false) {
    if (!isMinikube) {
        return Object.assign({}, process.env);
    }

    const dockerEnvProcess = childProcess.execSync(
        "minikube docker-env --shell bash",
        { encoding: "utf8" }
    );
    const dockerEnv = dockerEnvProcess
        .split("\n")
        .filter(line => line.indexOf("export ") === 0)
        .reduce(function(env, line) {
            const match = /^export (\w+)="(.*)"$/.exec(line);
            if (match) {
                env[match[1]] = match[2];
            }
            return env;
        }, {});

    const env = Object.assign({}, process.env, dockerEnv);
    return env;
}

function checkIfKubectlValid(env) {
    try {
        childProcess.execSync("kubectl", {
            stdio: "ignore",
            env: env
        });
    } catch (e) {
        throw new Error(
            `Failed to execute \`kubectl\` utility: ${e}\n` +
                "Make sure you have install & config `kubectl` properly before try again."
        );
    }
}

function checkNamespace(env, namespace) {
    try {
        childProcess.execSync(`kubectl get namespace ${namespace}`, {
            stdio: "ignore",
            env: env
        });
        return true;
    } catch (e) {
        console.log(
            chalk.red(
                `Failed to get k8s namespace \`${namespace}\` or the namespace has not been created yet: ${e}`
            )
        );
        return false;
    }
}

function buildConfigMapTemplateObject(env, namespace, name) {
    let configData;
    try {
        configData = childProcess.execSync(
            `kubectl --namespace="${namespace}" get configmap ${COMPILER_CONFIG_MAP_NAME} -o=json`,
            {
                env: env
            }
        );
    } catch (e) {
        throw new Error(
            `Failed to retrieve configMap data from namespace \`${namespace}\`.`
        );
    }

    try {
        configData = JSON.parse(configData);
    } catch (e) {
        throw new Error(
            `Failed to retrieve configMap data from namespace \`${namespace}\`. Invalid response returned: ${configData}`
        );
    }
    if (!configData.data.image) {
        throw new Error("Failed to retrieve image repo info from configMap.");
    }

    return {
        ...configData,
        metadata: {
            name,
            namespace,
            annotations: {},
            creationTimestamp: null
        }
    };
}

function createConfigMap(env, namespace, configMapName, data) {
    const configObj = buildConfigMapTemplateObject(
        env,
        namespace,
        configMapName
    );
    configObj.data = { ...configObj.data, ...data };

    const configContent = JSON.stringify(configObj);

    childProcess.execSync(`kubectl apply --namespace ${namespace} -f -`, {
        input: configContent,
        env: env
    });
    return configObj.data.image;
}

function buildJobTemplateObject(namespace, jobId, image) {
    return {
        kind: "Job",
        apiVersion: "batch/v1",
        metadata: {
            name: jobId,
            namespace,
            labels: {
                "magda-job-id": jobId
            }
        },
        spec: {
            template: {
                metadata: {
                    name: "scss-compiler"
                },
                spec: {
                    containers: [
                        {
                            name: "scss-compiler",
                            image: image,
                            command: [
                                "node",
                                "/usr/src/app/component/dist/index.js"
                            ],
                            env: [
                                {
                                    name: "USER_ID",
                                    value:
                                        "00000000-0000-4000-8000-000000000000"
                                },
                                {
                                    name: "CONTENT_API_URL",
                                    value: "http://content-api/v0"
                                },
                                {
                                    name: "SCSS_VARS",
                                    valueFrom: {
                                        configMapKeyRef: {
                                            name: "scss-compiler-config",
                                            key: "scssVars"
                                        }
                                    }
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
                            ],
                            imagePullPolicy: "Always"
                        }
                    ],
                    restartPolicy: "Never"
                }
            }
        }
    };
}

function createJob(env, namespace, image) {
    const jobId = uniqid("scss-compiler-");
    const jobObj = buildJobTemplateObject(namespace, jobId, image);

    const configContent = JSON.stringify(jobObj);

    childProcess.execSync(`kubectl apply --namespace ${namespace} -f -`, {
        input: configContent,
        env: env
    });

    return jobId;
}

function checkingJobProgress(env, namespace, jobId) {
    function getJobStatus() {
        const jobDataContent = childProcess.execSync(
            `kubectl --namespace="${namespace}" get job -l magda-job-id=${jobId} -o=json`,
            {
                env: env
            }
        );
        const jobData = JSON.parse(jobDataContent);
        if (
            typeof jobData !== "object" ||
            !jobData.items ||
            !jobData.items.length ||
            !jobData.items[0] ||
            !jobData.items[0].status
        ) {
            throw new Error(`Invaid Job Status data: ${jobDataContent}`);
        }
        const status = jobData.items[0].status;
        if (status.succeeded >= 1) {
            console.log(chalk.green(`The updating job has been completed!`));
            deleteJob(env, namespace, jobId);
            process.exit();
        } else {
            console.log("");
            console.log(
                `The updating job is still pending complete. Current status: `
            );
            console.log(`Failed Times: ${status.failed ? status.failed : 0}`);
            console.log(`Active Job: ${status.active ? status.active : 0}`);
            console.log(`Re-check status in ${CHECKING_INTERVAL} seconds...`);
        }
    }

    function checkOnce() {
        try {
            getJobStatus();
        } catch (e) {
            console.log(
                chalk.red(
                    `Error has been detected when checking Job status: ${e}`
                )
            );
            process.exit(1);
        }
    }

    setInterval(checkOnce, CHECKING_INTERVAL * 1000);

    checkOnce();
}

function deleteJob(env, namespace, jobId) {
    try {
        console.log(chalk.yellow(`Deleting Job ${jobId}...`));
        childProcess.execSync(
            `kubectl --namespace="${namespace}" delete job ${jobId}`,
            {
                env: env
            }
        );
        console.log(chalk.green(`Job ${jobId} has been deleted!`));
    } catch (e) {
        console.log(chalk.red(`Failed to delete job ${jobId}: ${e}`));
    }
}
