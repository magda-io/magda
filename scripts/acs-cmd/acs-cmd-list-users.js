#!/usr/bin/env node
import { require } from "@magda/esm-utils";
const pkg = require("../package.json");
import { program } from "commander";
import chalk from "chalk";
import getDBPool from "../db/getDBPool.js";
import { table } from "table";

const pool = getDBPool();

program
    .description("List all users")
    .version(pkg.version)
    .action(async () => {
        try {
            const selectFields = ["id", "displayName", "orgUnitId"];
            const result = await pool.query(
                `SELECT ${selectFields
                    .map((n) => `"${n}"`)
                    .join(", ")} FROM users`
            );
            if (!result || !result.rows || !result.rows.length) {
                throw new Error("Cannot find any records!");
            }

            const data = [["ID", "Name", "Org Unit", "Roles"]];
            const options = {
                columns: {
                    0: {
                        width: 36
                    },
                    1: {
                        width: 15
                    },
                    2: {
                        width: 20
                    },
                    3: {
                        width: 37
                    }
                }
            };
            for (let i = 0; i < result.rows.length; i++) {
                const user = result.rows[i];
                const roles = await getRolesByUserId(user["id"]);
                const row = selectFields
                    .map((k) => user[k])
                    .concat([
                        roles.map((r) => `${r.id}:\n${r.name}`).join("\n\n")
                    ]);
                row[2] = await getOrgUnitNameById(row[2]);
                data.push(row);
            }
            console.log(table(data, options));
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);

async function getRolesByUserId(userId) {
    const result = await pool.query(
        `SELECT r.* 
        FROM user_roles AS ur
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1`,
        [userId]
    );
    if (!result || !result.rows || !result.rows.length) return [];
    return result.rows;
}

async function getOrgUnitNameById(id) {
    const result = await pool.query(
        `SELECT name 
        FROM org_units
        WHERE id = $1`,
        [id]
    );
    if (!result || !result.rows || !result.rows.length) return null;
    return result.rows[0]["name"];
}
