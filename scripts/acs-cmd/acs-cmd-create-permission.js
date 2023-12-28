#!/usr/bin/env node
import { require } from "@magda/esm-utils";
const pkg = require("../package.json");
import { program } from "commander";
import chalk from "chalk";
import getDBPool from "../db/getDBPool.js";

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
