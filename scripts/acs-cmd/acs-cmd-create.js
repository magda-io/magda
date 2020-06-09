#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");

program
    .version(pkg.version)
    .description(
        `A tool for creating magda access control data. Version: ${pkg.version}`
    )
    .command("permission", "Create permission")
    .command("operation", "Create operation")
    .on("command:*", function (cmds) {
        if (["permission", "operation"].indexOf(cmds[0]) === -1) {
            console.error(
                chalk.red(
                    `Invalid command: ${program.args.join(
                        " "
                    )}\nSee --help for a list of available commands.`
                )
            );
            process.exit(1);
        }
    })
    .parse(process.argv);
