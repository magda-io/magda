#!/usr/bin/env node
const { askQuestions, getEnvVarInfo } = require("./askQuestions");
const k8sExecution = require("./k8sExecution");
const clear = require("clear");
const chalk = require("chalk");
const Configstore = require("configstore");

const appName = "magda-create-secrets";
const pkg = require("../package.json");
const config = new Configstore("magda-create-secrets", {});

const program = require("commander");

program
    .version(pkg.version)
    .usage("[options]")
    .description(`A tool for magda k8s secrets setup. Version: ${pkg.version}`)
    .option(
        "-E, --execute [configFilePath]",
        "Create k8s secrets in cluster using config file without asking any user input." +
            "If configFilePath is not specify, program will attempt to load config file from " +
            `either \`$XDG_CONFIG_HOME/configstore/${appName}.json\` or \`~/.config/configstore/${appName}.json\``
    )
    .option("-P, --print", "Print previously saved local config data to stdout")
    .option("-D, --delete", "Delete previously saved local config data");

program.on("--help", function() {
    const envInfo = getEnvVarInfo();
    console.log("  Available Setting ENV Variables:");
    console.log("");
    envInfo.forEach(item => {
        console.log(`    ${item.name} : ${item.description}`);
    });
    console.log("");
});

program.parse(process.argv);

const programOptions = program.opts();

if (programOptions.print) {
    process.stdout.write(JSON.stringify(config.all), "utf-8", function() {
        process.exit();
    });
} else if (programOptions.delete) {
    config.clear();
    console.log(chalk.green("All local saved config data has been deleted!"));
    process.exit();
} else if (programOptions.execute) {
    console.log("\n");
    console.log(
        chalk.green(`${appName} tool version: ${pkg.version} Execute Mode`)
    );
    console.log("Execute mode is still in development...");
} else {
    clear();
    console.log("\n");
    console.log(chalk.green(`${appName} tool version: ${pkg.version}`));
    askQuestions(config).then(function(shouldCreateSecrets) {
        if (shouldCreateSecrets) {
            k8sExecution(config).then(
                function() {
                    console.log(
                        chalk.green(
                            "All required secrets have been successfully created!"
                        )
                    );
                    process.exit();
                },
                function(error) {
                    console.log(
                        chalk.red(`Failed to create required secrets: ${error}`)
                    );
                    process.exit();
                }
            );
        } else {
            process.exit();
        }
    });
}
