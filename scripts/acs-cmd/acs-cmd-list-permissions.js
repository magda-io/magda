#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");
const getDBPool = require("../org-tree/getDBPool");
const { table } = require("table");

const pool = getDBPool();

program
    .description("List all permissions")
    .version(pkg.version)
    .action(async () => {
        try {
            const selectFields = ["id", "name", "description"];
            const result = await pool.query(
                `SELECT ${selectFields.join(", ")} FROM permissions`
            );
            if (!result || !result.rows || !result.rows.length) {
                throw new Error("Cannot find any records!");
            }

            const data = [["ID", "Name", "Description", "Operations"]];
            const options = {
                columns: {
                    0: {
                        width: 36
                    },
                    1: {
                        width: 10
                    },
                    2: {
                        width: 11
                    },
                    3: {
                        width: 10
                    },
                    4: {
                        width: 10
                    },
                    5: {
                        width: 10
                    }
                }
            };
            for (let i = 0; i < result.rows.length; i++) {
                const res = result.rows[i];
                const operations = await getOperationsByPermissionId(res["id"]);
                data.push(
                    selectFields
                        .map(k => res[k])
                        .concat([operations.map(op => op.uri).join("\n")])
                );
            }
            console.log(table(data, options));
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);

async function getOperationsByPermissionId(permissionId) {
    const result = await pool.query(
        `SELECT op.* 
        FROM permission_operations AS pop
        LEFT JOIN operations op ON op.id = pop.operation_id
        WHERE pop.permission_id = $1`,
        [permissionId]
    );
    if (!result || !result.rows || !result.rows.length) return [];
    return result.rows;
}
