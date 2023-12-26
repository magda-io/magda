#!/usr/bin/env node
import { require } from "@magda/typescript-common/dist/esmUtils.js";
const pkg = require("../package.json");
import { program } from "commander";
import chalk from "chalk";

program
    .version(pkg.version)
    .description(
        `A tool for removing magda access control role / permission assignment. Version: ${pkg.version}`
    )
    .command(
        "permission <permissionId> <roleId>",
        "Remove a permission from a role"
    )
    .command("role <roleId> <userId>", "Remove a role from a user")
    .on("command:*", function (cmds) {
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
