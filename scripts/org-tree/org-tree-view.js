#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");
const NestedSetModelQueryer = require("@magda/authorization-api/dist/NestedSetModelQueryer")
    .default;
const getDBPool = require("../db/getDBPool");

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
