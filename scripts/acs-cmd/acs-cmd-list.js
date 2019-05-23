#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");

program
    .version(pkg.version)
    .description(
        `A tool for viewing magda access control data. Version: ${pkg.version}`
    )
    .command("resources", "List all resources")
    .command("permissions", "List all permissions")
    .command("roles", "List all roles")
    .command("users", "List all users")
    .parse(process.argv);
