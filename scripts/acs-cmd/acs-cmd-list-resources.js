#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");
const getDBPool = require("../db/getDBPool");
const { table } = require("table");

const pool = getDBPool();

program
    .description("List all resources")
    .version(pkg.version)
    .action(async () => {
        try {
            const result = await pool.query(`SELECT * FROM resources`);
            if (!result || !result.rows || !result.rows.length) {
                throw new Error("Cannot find any records!");
            }

            const data = [["URI", "Name", "Description", "Operations"]];
            for (let i = 0; i < result.rows.length; i++) {
                const res = result.rows[i];
                res["operations"] = await getOperationsByResourceId(res["id"]);
                res["operations"] = res["operations"]
                    .map((op) => op.uri)
                    .join("\n");
                delete res["id"];
                data.push(Object.values(res));
            }

            console.log(table(data));
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);

async function getOperationsByResourceId(resourceId) {
    const result = await pool.query(
        `SELECT * FROM operations WHERE resource_id = $1`,
        [resourceId]
    );
    if (!result || !result.rows || !result.rows.length) return [];
    return result.rows;
}
