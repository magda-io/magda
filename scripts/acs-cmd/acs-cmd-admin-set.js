#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");
const getDBPool = require("../db/getDBPool");
const { recordExist, ADMIN_ROLE_ID } = require("./utils");

const pool = getDBPool();

program
    .description("Make a user an Admin user")
    .option("<userId>", "User ID")
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
                !(await recordExist(pool, "user_roles", {
                    role_id: ADMIN_ROLE_ID,
                    user_id: userId
                }))
            ) {
                await pool.query(
                    `INSERT INTO "user_roles" ("role_id", "user_id") VALUES ($1, $2)`,
                    [ADMIN_ROLE_ID, userId]
                );
            }

            await pool.query(
                `UPDATE "users" SET "isAdmin" = $1 WHERE "id" = $2`,
                [true, userId]
            );
            console.log(chalk.green("Operation Completed!"));
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);
