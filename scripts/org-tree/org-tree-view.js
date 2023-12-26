#!/usr/bin/env node
import { require } from "@magda/typescript-common/dist/esmUtils.js";
const pkg = require("../package.json");
import { program } from "commander";
import chalk from "chalk";
import NestedSetModelQueryer from "@magda/authorization-api/dist/NestedSetModelQueryer.js";
import getDBPool from "../db/getDBPool.js";

program
    .version(pkg.version)
    .description(`Display the entire tree in text.`)
    .parse(process.argv);

const pool = getDBPool();
const queryer = new NestedSetModelQueryer(pool, "org_units");
(async () => {
    try {
        const textTree = await queryer.getTreeTextView();
        console.log("\n");
        console.log(chalk.green(textTree));
    } catch (e) {
        console.error(chalk.red(`Error: ${e}`));
    }
    process.exit(0);
})();
