const inquirer = require("inquirer");
const trim = require("lodash/trim");
const fse = require("fs-extra");
const fs = require("fs");
const path = require("path");
const moment = require("moment");
const chalk = require("chalk");

const questions = [
    {
        type: "list",
        name: "deploy-to-google-cloud",
        message:
            "Are you creating k8s secrets for google cloud or local testing cluster?",
        choices: [
            {
                name: "Google Cloud Kubernetes Cluster",
                value: true
            },
            {
                name: "Local Testing Kubernetes Cluster",
                value: false
            }
        ]
    },
    {
        type: "list",
        name: "local-cluster-type",
        message:
            "Which local k8s cluster environment you are going to connect to?",
        choices: ["minikube", "docker"],
        when: onlyWhenQuestion("deploy-to-google-cloud", false)
    },
    {
        type: "list",
        name: "use-cloudsql-instance-credentials",
        message: "Do you use google cloud SQL service as your database?",
        choices: [
            {
                name: "YES",
                value: true
            },
            {
                name: "NO",
                value: false
            }
        ],
        when: onlyAvailableForGoogleCloud
    },
    {
        type: "fuzzypath",
        name: "cloudsql-instance-credentials",
        pathFilter: pathFilterByExt("json"),
        suggestOnly: false,
        rootPath: path.resolve(),
        message:
            "Please provide the path to the credentials JSON file for your Google SQL cloud service access:",
        when: onlyWhenQuestion("use-cloudsql-instance-credentials", true),
        validate: validJsonFileExist,
        filter: getJsonFileContent
    },
    {
        type: "list",
        name: "use-storage-account-credentials",
        message: "Do you use google storage service?",
        choices: [
            {
                name: "YES",
                value: true
            },
            {
                name: "NO",
                value: false
            }
        ],
        when: onlyAvailableForGoogleCloud
    },
    {
        type: "fuzzypath",
        name: "storage-account-credentials",
        pathFilter: pathFilterByExt("json"),
        suggestOnly: false,
        rootPath: path.resolve(),
        message:
            "Please provide the path to the private key JSON file for your Google storage service access:",
        when: onlyWhenQuestion("use-storage-account-credentials", true),
        validate: validJsonFileExist,
        filter: getJsonFileContent
    },
    {
        type: "list",
        name: "use-smtp-secret",
        message:
            "Do you need to access STMP service for sending data request email?",
        choices: [
            {
                name: "YES",
                value: true
            },
            {
                name: "NO",
                value: false
            }
        ]
    },
    {
        type: "input",
        name: "smtp-secret-username",
        message: "Please provide SMTP service username:",
        when: onlyWhenQuestion("use-smtp-secret", true),
        validate: input =>
            trim(input).length ? true : "username cannot be empty!"
    },
    {
        type: "input",
        name: "smtp-secret-password",
        message: "Please provide SMTP service password:",
        when: onlyWhenQuestion("use-smtp-secret", true),
        validate: input =>
            trim(input).length ? true : "password cannot be empty!"
    },
    {
        type: "list",
        name: "use-regcred",
        message:
            "Do you use Gitlab as your CI system and need the access to Gitlab docker registry?",
        choices: [
            {
                name: "YES",
                value: true
            },
            {
                name: "NO",
                value: false
            }
        ],
        when: onlyAvailableForGoogleCloud
    },
    {
        type: "list",
        name: "use-regcred-password-from-env",
        message:
            "Do you want to get gitlab docker registry password from environment variable ($CI_JOB_TOKEN) or input manually now?",
        choices: [
            {
                name: "YES (Get from $CI_JOB_TOKEN)",
                value: true
            },
            {
                name: "NO (input manually)",
                value: false
            }
        ],
        when: onlyWhenQuestion("use-regcred", true)
    },
    {
        type: "input",
        name: "regcred-email",
        message:
            "Please provide the email address that you want to use for Gitlab docker registry:",
        when: onlyWhenQuestion("use-regcred", true),
        validate: input =>
            trim(input).length ? true : "email cannot be empty!"
    },
    {
        type: "input",
        name: "regcred-password",
        message: "Please provide password for Gitlab docker registry:",
        when: onlyWhenQuestion("use-regcred-password-from-env", false),
        validate: input =>
            trim(input).length ? true : "password cannot be empty!"
    },
    {
        type: "input",
        name: "oauth-secrets-google",
        message: "Please provide google-client-secret for oAuth SSO:",
        validate: input =>
            trim(input).length ? true : "secret cannot be empty!"
    },
    {
        type: "input",
        name: "oauth-secrets-facebook",
        message: "Please provide facebook-client-secret for oAuth SSO:",
        validate: input =>
            trim(input).length ? true : "secret cannot be empty!"
    },
    {
        type: "list",
        name: "get-namespace-from-env",
        message:
            "Do you want to use environment variable ($CI_COMMIT_REF_SLUG) to determine which k8s namespace the secrets should be create into or input manually now?",
        choices: [
            {
                name:
                    "YES (Determin k8s namespace by $CI_JOB_TOKEN at runtime)",
                value: true
            },
            {
                name: "NO (input manually now)",
                value: false
            }
        ]
    },
    {
        type: "input",
        name: "cluster-namespace",
        message:
            "What's the namespace you want to create secrets into (input `default` if you want to use the `default` namespace)?",
        validate: input =>
            trim(input).length ? true : "Cluster namespace cannot be empty!"
    },
    {
        type: "list",
        name: "allow-env-override-settings",
        message:
            "Do you want to allow environment variables (see --help for full list) to override current settings at runtime?",
        choices: [
            {
                name: "YES (Any environment variable can overide my settings)",
                value: true
            },
            {
                name: "NO (No settings will be override)",
                value: false
            }
        ]
    }
];

function onlyAvailableForGoogleCloud(anwsers) {
    return anwsers["deploy-to-google-cloud"];
}

function onlyWhenQuestion(name, value) {
    return anwsers => {
        return anwsers[name] === value;
    };
}

function validJsonFileExist(input) {
    try {
        if (!fs.existsSync(trim(input)))
            return "The file doe not exist or cannot read. Please re-select.";
        const content = fs.readFileSync(filePath, {
            encoding: "utf-8"
        });
        try {
            const data = JSON.parse(content);
            return true;
        } catch (e) {
            return `The file content is not in valid JSON format: ${e.getMessage()}`;
        }
    } catch (e) {
        return e.getMessage();
    }
}

function pathFilterByExt(ext) {
    return (isDirectory, nodePath) => {
        if (isDirectory) return false;
        const idx = nodePath.lastIndexOf(".");
        let fileExt;
        if (idx === -1 || idx === nodePath.length - 1) {
            fileExt = "";
        } else {
            fileExt = nodePath.substring(idx + 1).toLowerCase();
        }
        return fileExt === ext.toLowerCase();
    };
}

function getJsonFileContent(filePath) {
    filePath = trim(filePath);
    return {
        value: filePath,
        data: fse.readJsonSync(filePath, {
            encoding: "utf-8"
        })
    };
}

function prefileQuestions(questions, config) {
    return questions.map(question => {
        let configValue = config.get(question.name);
        const type = typeof configValue;
        if (type === "undefined") return question;
        if (type === "object") {
            if (typeof configValue.value === "undefined") return question;
            else configValue = configValue.value;
        }

        return Object.assign({}, question, {
            default: configValue
        });
    });
}

const inquirerFuzzyPath = require("./inquirer-fuzzy-path");
inquirer.registerPrompt("fuzzypath", inquirerFuzzyPath);
function askSettingQuestions(config) {
    return inquirer
        .prompt(prefileQuestions(questions, config))
        .then(function(answers) {
            config.clear();
            config.set(answers);
            config.set("creation-time", new Date().toISOString());
        });
}
function askClosingQuestions(config) {
    return inquirer
        .prompt([
            {
                type: "list",
                name: "deploy-now",
                message:
                    "Do you want to connect to kubernetes cluster to create secrets now?",
                choices: [
                    {
                        name: "YES (Create Secrets in Cluster now)",
                        value: true
                    },
                    {
                        name: "NO (Exit but all settings have been saved)",
                        value: false
                    }
                ]
            }
        ])
        .then(answers => answers["deploy-now"]);
}
function askStartSecretsCreationWithoutQuestions(config) {
    const creationTime = new Date(config.get("creation-time"));
    console.log(
        chalk.yellow(
            `Found previous saved config (${moment(creationTime).format(
                "MMMM Do YYYY, h:mm:ss a"
            )}).`
        )
    );
    return inquirer
        .prompt([
            {
                type: "list",
                name: "deploy-now",
                message:
                    "Do you want to connect to kubernetes cluster to create secrets without going through any questions?",
                choices: [
                    {
                        name:
                            "YES (Create Secrets in Cluster using existing config now)",
                        value: true
                    },
                    {
                        name: "NO (Going through all questions)",
                        value: false
                    }
                ]
            }
        ])
        .then(answers => answers["deploy-now"]);
}
function askQuestions(config) {
    return new Promise(function(resolve, reject) {
        const creationTime = config.get("creation-time");
        let p;
        if (typeof creationTime !== "undefined") {
            p = askStartSecretsCreationWithoutQuestions(config);
        } else {
            p = Promise.resolve(false);
        }
        p.then(ifGoCreatioin => {
            if (ifGoCreatioin) {
                return true;
            } else {
                return askSettingQuestions(config).then(
                    askClosingQuestions.bind(null, config)
                );
            }
        }).then(answer => resolve(answer));
    });
}

function getEnvVarInfo() {
    return questions.map(item => ({
        name: settingNameToEnvVarName(item.name),
        settingName: item.name,
        description: item.message
    }));
}

function settingNameToEnvVarName(settingName) {
    return settingName.replace(/\-/g, "_").toUpperCase();
}

module.exports = {
    askQuestions,
    getEnvVarInfo,
    settingNameToEnvVarName
};
