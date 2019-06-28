#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");
const getDBPool = require("./getDBPool");
const getUserIdFromNameOrId = require("./getUserIdFromNameOrId");

program
    .description(
        "Unassign the specified user from any node" +
            "\n`userNameOrId` can be either entity name or Id. \n" +
            "\tIf more than one entities are located by entity name, the first one will be used."
    )
    .option("<userNameOrId>", "user name or id")
    .version(pkg.version)
    .action(async userNameOrId => {
        try {
            if (process.argv.slice(2).length < 1) {
                program.help();
            }
            userNameOrId = userNameOrId ? userNameOrId.trim() : "";
            if (userNameOrId === "")
                throw new Error("User Name or Id can't be empty!");
            const pool = getDBPool();

            const userId = await getUserIdFromNameOrId(userNameOrId, pool);

            await pool.query(
                `UPDATE "users" SET "orgUnitId" = NULL WHERE "id" = $1`,
                [userId]
            );

            console.log(
                chalk.green(`The user (id: ${userId}) has been unassigned.`)
            );
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);
