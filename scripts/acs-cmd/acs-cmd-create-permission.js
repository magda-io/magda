#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");
const getDBPool = require("../db/getDBPool");
const { recordExist } = require("./utils");

const pool = getDBPool();

program
    .version(pkg.version)
    .description(`A tool for creating permissions. Version: ${pkg.version}`)
    .option("<name>", "Permission name")
    .option("<description>", "Permission description")
    .action(async (name, description) => {
        try {
            await pool.query(
                `INSERT INTO permissions (name, description) VALUES ($1, $2)`,
                [name, description]
            );
            console.log(chalk.green("Operation Completed!"));
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);
