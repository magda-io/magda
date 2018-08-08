const childProcess = require("child_process");
const process = require("process");
const chalk = require("chalk");
const { getEnvVarInfo } = require("./askQuestions");

function k8sExecution(config) {
    const env = getEnvByClusterType(config);
    let configData = Object.assign({}, config.all);
    const ifAllowEnvVarOverride = configData["allow-env-override-settings"];
    if (ifAllowEnvVarOverride) {
        configData = overrideSettingWithEnvVars(configData, env);
    }
    validKubectl(env);
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

function overrideSettingWithEnvVars(configData, env) {
    getEnvVarInfo().forEach(item => {
        const envVal = env[item.name];
        if (typeof envVal === "undefined") return;
        configData[item.settingName] = envVal;
    });
    return configData;
}

function validKubectl(env) {
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

module.exports = k8sExecution;
