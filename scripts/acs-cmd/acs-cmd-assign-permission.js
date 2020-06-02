#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");
const getDBPool = require("../db/getDBPool");
const { recordExist } = require("./utils");

const pool = getDBPool();

program
    .description("assign the permission to a role")
    .option("<permissionId>", "Permission ID")
    .option("<roleId>", "Role ID")
    .version(pkg.version)
    .action(async (permissionId, roleId) => {
        try {
            if (process.argv.slice(2).length < 2) {
                program.help();
            }
            if (
                !(await recordExist(pool, "permissions", { id: permissionId }))
            ) {
                throw new Error(
                    `Supplied permissionId: ${permissionId} doesn't exist`
                );
            }
            if (!(await recordExist(pool, "roles", { id: roleId }))) {
                throw new Error(`Supplied roleId: ${roleId} doesn't exist`);
            }
            if (
                await recordExist(pool, "role_permissions", {
                    role_id: roleId,
                    permission_id: permissionId
                })
            ) {
                throw new Error(
                    `Cannot re-assign the permission: Role (id: ${roleId}) has the permission (id: ${permissionId}) already!`
                );
            }
            await pool.query(
                `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)`,
                [roleId, permissionId]
            );
            console.log(chalk.green("Operation Completed!"));
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);
