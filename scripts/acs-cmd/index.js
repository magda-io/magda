#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");

program
    .version(pkg.version)
    .description(
        `A tool for managing magda access control data. Version: ${pkg.version}\n\n` +
            `If a database connection is required, the following environment variables will be used to create a connection:\n` +
            `  POSTGRES_HOST: database host; If not available in env var, 'localhost' will be used.\n` +
            `  POSTGRES_PORT: database port; If not available in env var, 5432 will be used.\n` +
            `  POSTGRES_DB: database name; If not available in env var, 'auth' will be used.\n` +
            `  POSTGRES_USER: database username; If not available in env var, 'postgres' will be used.\n` +
            `  POSTGRES_PASSWORD: database password; If not available in env var, '' will be used.`
    )
    .command(
        "admin",
        "Make an user an Admin user or remove admin role / status from a user"
    )
    .command("list", "List records (permissions, operations etc.)")
    .command("assign", "Assign a permission to a role or a role to a user")
    .command("remove", "Remove a permission from a role or a role from a user")
    .command("create", "Create permissions, operations etc")
    .command(
        "jwt <userId> [jwtSecret]",
        "calculate JWT token (only for testing purpose)"
    )
    .on("command:*", function (cmds) {
        if (
            ["admin", "list", "assign", "remove", "jwt", "create"].indexOf(
                cmds[0]
            ) === -1
        ) {
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
