#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");
const getDBPool = require("../db/getDBPool");

const pool = getDBPool();

program
    .version(pkg.version)
    .description(`A tool for creating operations. Version: ${pkg.version}`)
    .option("<permission>", "Permission name")
    .option("<uri>", "Operation uri")
    .option("<name>", "Operation name")
    .option("<description>", "Operation description")
    .action(async (permissionName, uri, name, description) => {
        try {
            await pool.query("BEGIN TRANSACTION");
            const permissionResult = await pool.query(
                `SELECT id FROM permissions WHERE name = $1`,
                [permissionName]
            );
            if (permissionResult.rows.length === 0) {
                console.log(
                    chalk.red("No permission found with name " + permissionName)
                );
                process.exit(1);
            }

            const permissionId = permissionResult.rows[0].id;

            const operationResult = await pool.query(
                `INSERT INTO operations (uri, name, description) VALUES ($1, $2, $3) RETURNING id`,
                [uri, name, description]
            );
            const operationId = operationResult.rows[0].id;

            await pool.query(
                `INSERT INTO permission_operations (permission_id, operation_id) VALUES ($1, $2)`,
                [permissionId, operationId]
            );

            await pool.query("COMMIT");
            console.log(chalk.green("Operation Completed!"));
        } catch (e) {
            await pool.query("ROLLBACK");
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);
