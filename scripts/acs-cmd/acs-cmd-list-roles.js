#!/usr/bin/env node
import { require } from "@magda/typescript-common/dist/esmUtils.js";
const pkg = require("../package.json");
import { program } from "commander";
import chalk from "chalk";
import getDBPool from "../db/getDBPool.js";
import { table } from "table";

const pool = getDBPool();

program
    .description("List all roles")
    .version(pkg.version)
    .action(async () => {
        try {
            const selectFields = ["id", "name", "description"];
            const result = await pool.query(
                `SELECT ${selectFields.join(", ")} FROM roles`
            );
            if (!result || !result.rows || !result.rows.length) {
                throw new Error("Cannot find any records!");
            }

            const data = [["ID", "Name", "Description", "Permissions"]];
            const options = {
                columns: {
                    0: {
                        width: 36
                    },
                    1: {
                        width: 20
                    },
                    2: {
                        width: 25
                    },
                    3: {
                        width: 37
                    }
                }
            };
            for (let i = 0; i < result.rows.length; i++) {
                const role = result.rows[i];
                const permissions = await getPermissionsByRoleId(role["id"]);
                data.push(
                    selectFields
                        .map((k) => role[k])
                        .concat([
                            permissions
                                .map((p) => `${p.id}:\n${p.name}`)
                                .join("\n\n")
                        ])
                );
            }
            console.log(table(data, options));
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);

async function getPermissionsByRoleId(roleId) {
    const result = await pool.query(
        `SELECT p.* 
        FROM role_permissions AS rp
        LEFT JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1`,
        [roleId]
    );
    if (!result || !result.rows || !result.rows.length) return [];
    return result.rows;
}
