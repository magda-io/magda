#!/usr/bin/env node
import { require } from "@magda/typescript-common/dist/esmUtils.js";
const pkg = require("../package.json");
import { program } from "commander";
import chalk from "chalk";
import getDBPool from "../db/getDBPool.js";
import { recordExist } from "./utils.js";

const pool = getDBPool();

program
    .description("Remove a role from a user")
    .option("<roleId>", "Role ID")
    .option("<userId>", "User ID")
    .version(pkg.version)
    .action(async (roleId, userId) => {
        try {
            if (process.argv.slice(2).length < 2) {
                program.help();
            }
            if (!(await recordExist(pool, "users", { id: userId }))) {
                throw new Error(`Supplied userId: ${userId} doesn't exist`);
            }
            if (!(await recordExist(pool, "roles", { id: roleId }))) {
                throw new Error(`Supplied roleId: ${roleId} doesn't exist`);
            }
            if (
                !(await recordExist(pool, "user_roles", {
                    role_id: roleId,
                    user_id: userId
                }))
            ) {
                throw new Error(
                    `Cannot remove the role: User (id: ${userId}) has no Role with id: ${roleId}!`
                );
            }
            await pool.query(
                `DELETE FROM user_roles WHERE role_id = $1 AND user_id = $2`,
                [roleId, userId]
            );
            console.log(chalk.green("Operation Completed!"));
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);
