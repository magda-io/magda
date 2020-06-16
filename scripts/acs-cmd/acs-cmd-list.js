#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");

program
    .version(pkg.version)
    .description(
        `A tool for viewing magda access control data. Version: ${pkg.version}`
    )
    .command("permissions", "List all permissions")
    .command("roles", "List all roles")
    .command("users", "List all users")
    .on("command:*", function (cmds) {
        if (["permissions", "roles", "users"].indexOf(cmds[0]) === -1) {
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
