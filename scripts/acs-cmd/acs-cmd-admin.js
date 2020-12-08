#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");

program
    .version(pkg.version)
    .description(
        `A tool for setting / unsetting Admin role / status to a user. Version: ${pkg.version} \n` +
            `Hint: Use 'acs-cmd list users' command to list all users in systemp`
    )
    .command("set <userId>", "Make a user an admin user")
    .command("unset <userId>", "Remove admin role / status from a user")
    .on("command:*", function (cmds) {
        if (["set", "unset"].indexOf(cmds[0]) === -1) {
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
