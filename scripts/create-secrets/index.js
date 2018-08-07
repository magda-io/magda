#!/usr/bin/env node
const askQuestions = require("./askQuestions");
const clear = require("clear");
const chalk = require("chalk");
const Configstore = require("configstore");

const appName = "magda-create-secrets";
const pkg = require("../package.json");
const config = new Configstore("magda-create-secrets", {});

const program = require("commander");
const inquirer = require("inquirer");

program
    .version(pkg.version)
    .usage("create-secrets [options]")
    .description(`A tool for magda k8s secrets setup. Version: ${pkg.version}`)
    .option(
        "-E, --execute [configFilePath]",
        "Create k8s secrets in cluster using config file without asking any user input." +
            "If configFilePath is not specify, program will attempt to load config file from " +
            `either \`$XDG_CONFIG_HOME/configstore/${appName}.json\` or \`~/.config/configstore/${appName}.json\``
    )
    .option("-P, --print", "Print previously saved local config data to stdout")
    .option("-D, --delete", "Delete previously saved local config data")
    .parse(process.argv);

const programOptions = program.opts();

if (programOptions.print) {
    process.stdout.write(JSON.stringify(config.all), "utf-8", function() {
        process.exit();
    });
} else if (programOptions.delete) {
    config.clear();
    console.log(chalk.green("All local saved config data has been deleted!"));
    process.exit();
} else {
    clear();
    console.log("\n");
    console.log(chalk.green(`${appName} tool version: ${pkg.version}`));
    askQuestions(config).then(function() {
        process.exit();
    });
    //const app = new App();
    //app.run();
}
