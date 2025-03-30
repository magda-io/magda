#!/usr/bin/env node
import { require } from "@magda/esm-utils";
const pkg = require("../package.json");
import { program } from "commander";
import chalk from "chalk";

program
    .version(pkg.version)
    .description(
        `A tool for setting / unsetting Admin role / status to a user. Version: ${pkg.version} \n` +
            `Hint: Use 'acs-cmd list users' command to list all users in the system`
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
