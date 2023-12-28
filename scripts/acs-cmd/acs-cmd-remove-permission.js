#!/usr/bin/env node
import { require } from "@magda/esm-utils";
const pkg = require("../package.json");
import { program } from "commander";
import chalk from "chalk";
import getDBPool from "../db/getDBPool.js";
import { recordExist } from "./utils.js";

const pool = getDBPool();

program
    .description("Remove a permission from a role")
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
                !(await recordExist(pool, "role_permissions", {
                    role_id: roleId,
                    permission_id: permissionId
                }))
            ) {
                throw new Error(
                    `Cannot remove the permission: Role (id: ${roleId}) has no permission with id: ${ropermissionIdleId}!`
                );
            }
            await pool.query(
                `DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2`,
                [roleId, permissionId]
            );
            console.log(chalk.green("Operation Completed!"));
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);
