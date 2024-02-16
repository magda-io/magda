#!/usr/bin/env node
import { require } from "@magda/esm-utils";
const pkg = require("../package.json");
import { program } from "commander";
import chalk from "chalk";
import getDBPool from "../db/getDBPool.js";
import getUserIdFromNameOrId from "./getUserIdFromNameOrId.js";

program
    .description("Remove the specified user to from any org unit.")
    .argument("<userNameOrId>", "user name or id")
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
