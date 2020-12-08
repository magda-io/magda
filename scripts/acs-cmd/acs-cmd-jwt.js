#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");
const buildJwt = require("@magda/typescript-common/dist/session/buildJwt")
    .default;

const DEFAULT_JWT_SECRET = "squirrel";

program
    .description(
        `calculate JWT token (only for testing purpose). Version: ${pkg.version}`
    )
    .option("<userId>", "User ID")
    .option(
        "[jwtSecret]",
        "Optional JWT secret. Default value: `" + DEFAULT_JWT_SECRET + "`"
    )
    .version(pkg.version)
    .action(async (userId, jwtSecret) => {
        try {
            if (process.argv.slice(2).length < 1) {
                program.help();
            }
            console.log(`JWT token for user ${userId} is: `);
            console.log(
                chalk.yellow(
                    buildJwt(
                        typeof jwtSecret === "string"
                            ? jwtSecret
                            : DEFAULT_JWT_SECRET,
                        userId
                    )
                )
            );
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);
