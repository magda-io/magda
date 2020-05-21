#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");
const getDBPool = require("../db/getDBPool");
const { recordExist } = require("./utils");

const pool = getDBPool();

program
    .description("assign the role to a user")
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
