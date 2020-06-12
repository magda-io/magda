#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");
const NestedSetModelQueryer = require("@magda/authorization-api/dist/NestedSetModelQueryer")
    .default;
const getDBPool = require("../db/getDBPool");
const getNodeIdFromNameOrId = require("./getNodeIdFromNameOrId");
const getUserIdFromNameOrId = require("./getUserIdFromNameOrId");

program
    .description("Remove the specified user to from any org unit.")
    .option("<userNameOrId>", "user name or id")
    .version(pkg.version)
    .action(async (userNameOrId) => {
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
