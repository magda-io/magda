#!/usr/bin/env node
import { require } from "@magda/esm-utils";
const pkg = require("../package.json");
import { program } from "commander";
import chalk from "chalk";
import getDBPool from "../db/getDBPool.js";
import { recordExist, ADMIN_ROLE_ID } from "./utils.js";

const pool = getDBPool();

program
    .description("Remove Admin role / status from a user")
    .argument("<userId>", "User ID")
    .version(pkg.version)
    .action(async (userId) => {
        try {
            if (process.argv.slice(2).length < 1) {
                program.help();
            }
            if (!(await recordExist(pool, "users", { id: userId }))) {
                throw new Error(`Supplied userId: ${userId} doesn't exist`);
            }
            if (
                await recordExist(pool, "user_roles", {
                    role_id: ADMIN_ROLE_ID,
                    user_id: userId
                })
            ) {
                await pool.query(
                    `DELETE FROM "user_roles" WHERE "role_id" = $1 AND "user_id" = $2`,
                    [ADMIN_ROLE_ID, userId]
                );
            }
            console.log(chalk.green("Operation Completed!"));
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);
