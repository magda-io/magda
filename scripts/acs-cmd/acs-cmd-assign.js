#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");

program
    .version(pkg.version)
    .description(
        `A tool for assigning magda access control role / permission. Version: ${pkg.version}`
    )
    .command(
        "permission <permissionId> <roleId>",
        "Assign a permission to a role"
    )
    .command("role <roleId> <userId>", "Assign a role to a user")
    .on("command:*", function(cmds) {
        if (["permission", "role"].indexOf(cmds[0]) === -1) {
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
