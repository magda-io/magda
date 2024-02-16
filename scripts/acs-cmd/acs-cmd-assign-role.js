#!/usr/bin/env node
import { require } from "@magda/esm-utils";
const pkg = require("../package.json");
import { program } from "commander";
import chalk from "chalk";
import getDBPool from "../db/getDBPool.js";
import { recordExist } from "./utils.js";

const pool = getDBPool();

program
    .description("assign the role to a user")
    .argument("<roleId>", "Role ID")
    .argument("<userId>", "User ID")
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
                await recordExist(pool, "user_roles", {
                    role_id: roleId,
                    user_id: userId
                })
            ) {
                throw new Error(
                    `Cannot re-assign the role: User (id: ${userId}) has the Role (id: ${roleId}) already!`
                );
            }
            await pool.query(
                `INSERT INTO user_roles (role_id, user_id) VALUES ($1, $2)`,
                [roleId, userId]
            );
            console.log(chalk.green("Operation Completed!"));
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);
