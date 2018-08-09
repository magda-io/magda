const childProcess = require("child_process");
const process = require("process");
const chalk = require("chalk");
const trim = require("lodash/trim");
const {
    getEnvVarInfo,
    askIfCreateNamespace,
    settingNameToEnvVarName
} = require("./askQuestions");
const Base64 = require("js-base64").Base64;
const pwgen = require("./pwgen");

const dbPasswordNames = [
    "authorization-db",
    "authorization-db-client",
    "combined-db",
    "combined-db-client",
    "discussions-db",
    "discussions-db-client",
    "registry-db",
    "registry-db-client",
    "session-db",
    "session-db-client"
];

let env = process.env;

function k8sExecution(config) {
    env = getEnvByClusterType(config);
    let configData = Object.assign({}, config.all);
    const ifAllowEnvVarOverride = configData["allow-env-override-settings"];
    if (ifAllowEnvVarOverride) {
        configData = overrideSettingWithEnvVars(configData);
    }
    validKubectl();
    let p = Promise.resolve().then(function() {
        configData["cluster-namespace"] = trim(configData["cluster-namespace"]);
        if (!configData["cluster-namespace"])
            throw new Error(
                "Cluster namespace cannot be empty! \n " +
                    "If you've set cluster namespace, make sure it's not overrided by env variable."
            );
    });
    if (!checkNamespace(configData["cluster-namespace"])) {
        p = p
            .then(
                askIfCreateNamespace.bind(null, configData["cluster-namespace"])
            )
            .then(function(ifCreate) {
                if (!ifCreate) {
                    console.log(
                        chalk.yellow(
                            `You need to create namespace \`${
                                configData["cluster-namespace"]
                            }\` before try again.`
                        )
                    );
                    process.exit();
                } else {
                    createNamespace();
                }
            });
    }
    return p.then(function() {
        const namespace = configData["cluster-namespace"];
        if (configData["use-cloudsql-instance-credentials"] === true) {
            createFileContentSecret(
                namespace,
                "cloudsql-instance-credentials",
                "credentials.json",
                configData["cloudsql-instance-credentials"]
            );
        }
        if (configData["use-storage-account-credentials"] === true) {
            createFileContentSecret(
                namespace,
                "storage-account-credentials",
                "db-service-account-private-key.json",
                configData["use-storage-account-credentials"]
            );
        }
        if (configData["use-smtp-secret"] === true) {
            createSecret(namespace, "smtp-secret", {
                username: configData["smtp-secret-username"],
                password: configData["smtp-secret-password"]
            });
        }
        (function() {
            const data = {};
            dbPasswordNames.forEach(key => {
                data[key] = configData["db-passwords"];
            });
            createSecret(namespace, "db-passwords", data);
        })();
        if (configData["use-regcred"] === true) {
            /**
             * always use `regcred-password`
             * `use-regcred-password-from-env` has been taken care seperately
             */
            createDockerRegistrySecret(
                namespace,
                "regcred",
                configData["regcred-password"],
                "registry.gitlab.com",
                "gitlab-ci-token",
                configData["regcred-email"]
            );
        }
        if (
            configData["use-oauth-secrets-google"] === true ||
            configData["use-oauth-secrets-facebook"] === true
        ) {
            const data = {};
            if (configData["use-oauth-secrets-google"]) {
                data["google-client-secret"] =
                    configData["oauth-secrets-google"];
            }
            if (configData["use-oauth-secrets-facebook"]) {
                data["facebook-client-secret"] =
                    configData["oauth-secrets-facebook"];
            }
            createSecret(namespace, "oauth-secrets", data);
        }

        (function() {
            const data = {};
            data["jwt-secret"] = pwgen();
            data["session-secret"] = pwgen();
            createSecret(namespace, "auth-secrets", data);
        })();
    });
}

function getEnvByClusterType(config) {
    const localClusterType = config.get("local-cluster-type");
    if (
        typeof localClusterType === "undefined" ||
        localClusterType !== "minikube"
    ) {
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

function overrideSettingWithEnvVars(configData) {
    getEnvVarInfo().forEach(item => {
        const envVal = env[item.name];
        if (typeof envVal === "undefined") return;
        configData[item.settingName] = envVal;
    });
    if (
        configData["use-regcred-password-from-env"] === true &&
        env["CI_JOB_TOKEN"] &&
        !env[settingNameToEnvVarName("regcred-password")]
    ) {
        configData["regcred-password"] = env["CI_JOB_TOKEN"];
    }
    if (
        configData["get-namespace-from-env"] === true &&
        env["CI_COMMIT_REF_SLUG"] &&
        !env[settingNameToEnvVarName("cluster-namespace")]
    ) {
        configData["cluster-namespace"] = env["CI_COMMIT_REF_SLUG"];
    }
    if (
        typeof configData["manual-db-passwords"] === "object" &&
        configData["manual-db-passwords"]["answer"] === false &&
        configData["manual-db-passwords"]["password"] &&
        !env[settingNameToEnvVarName("db-passwords")]
    ) {
        configData["db-passwords"] =
            configData["manual-db-passwords"]["password"];
    }
    return configData;
}

function validKubectl() {
    try {
        childProcess.execSync("kubectl", {
            stdio: "ignore",
            env: env
        });
    } catch (e) {
        console.log(chalk.red(`Failed to execute \`kubectl\` utility: ${e}`));
        console.log(
            chalk.red(
                "Make sure you have install & config `kubectl` properly before try again."
            )
        );
        process.exit();
    }
}

function checkNamespace(namespace) {
    try {
        childProcess.execSync(`kubectl get namespace ${namespace}`, {
            stdio: "ignore",
            env: env
        });
        return true;
    } catch (e) {
        console.log(
            chalk.red(
                `Failed to get k8s namespace ${namespace} or namespace has not been created yet: ${e}`
            )
        );
        return false;
    }
}

function createNamespace(namespace) {
    childProcess.execSync(`kubectl create namespace ${namespace}`, {
        stdio: "inherit",
        env: env
    });
}

function getTplObj(name, namespace) {
    return {
        apiVersion: "v1",
        kind: "Secret",
        type: "Opaque",
        metadata: {
            name,
            namespace,
            annotations: {},
            creationTimestamp: null
        }
    };
}

function createFileContentSecret(namespace, secretName, fileName, content) {
    createSecret(namespace, secretName, {
        [fileName]: content
    });
}

function createDockerRegistrySecret(
    namespace,
    secretName,
    password,
    dockerServer,
    username,
    email
) {
    const dockerConfig = {
        auths: {
            [dockerServer]: {
                username: username,
                password: password,
                email: email,
                auth: Base64.encode(`${username}:${password}`)
            }
        }
    };

    const data = {};
    data[".dockerconfigjson"] = JSON.stringify(dockerConfig);
    createSecret(
        namespace,
        secretName,
        data,
        true,
        "kubernetes.io/dockerconfigjson"
    );
}

function createSecret(namespace, secretName, data, encodeAllDataFields, type) {
    console.log(
        chalk.yellow(
            `Creating secret \`${secretName}\` in namespace \`${namespace}\`...`
        )
    );
    const configObj = getTplObj(secretName, namespace);
    configObj.data = data;
    if (type) configObj.type = type;
    if (encodeAllDataFields !== false) {
        Object.keys(configObj.data).forEach(key => {
            configObj.data[key] = Base64.encode(configObj.data[key]);
        });
    }
    const configContent = JSON.stringify(configObj);
    childProcess.execSync(`kubectl apply --namespace ${namespace} -f -`, {
        input: configContent,
        stdio: "inherit",
        env: env
    });
}

module.exports = k8sExecution;
