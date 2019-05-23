#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");

program
    .version(pkg.version)
    .description(
        `A tool for managing magda access control data. Version: ${
            pkg.version
        }\n\n` +
            `If a database connection is required, the following environment variables will be used to create a connection:\n` +
            `  POSTGRES_HOST: database host; If not available in env var, 'localhost' will be used.\n` +
            `  POSTGRES_DB: database name; If not available in env var, 'auth' will be used.\n` +
            `  POSTGRES_USER: database username; If not available in env var, 'postgres' will be used.\n` +
            `  POSTGRES_PASSWORD: database password; If not available in env var, '' will be used.`
    )
    .command("list", "List records (resources, operation etc.)")
    .command(
        "assign-permission <permissionId> <roleId>",
        "Assign a permission to a role"
    )
    .command(
        "remove-permission <permissionId> <roleId>",
        "Remove a permission from a role"
    )
    .command("assign-role <roleId> <userId>", "Assign a role to a user")
    .command("remove-role <roleId> <userId>", "Remove a role from a user")
    .parse(process.argv);
