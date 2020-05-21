#!/usr/bin/env node
const pkg = require("../package.json");
const program = require("commander");
const chalk = require("chalk");
const NestedSetModelQueryer = require("@magda/authorization-api/dist/NestedSetModelQueryer")
    .default;
const getDBPool = require("../db/getDBPool");

program
    .description(
        `Create a root tree node with specified name. You can then complete other node fields using other DB admin tools.`
    )
    .option("<nodeName>", "Root node name")
    .version(pkg.version)
    .action(async nodeName => {
        try {
            if (!process.argv.slice(2).length) {
                program.help();
            }
            nodeName = nodeName.trim();
            if (nodeName === "") throw new Error("Node Name can't be empty!");
            const pool = getDBPool();
            const queryer = new NestedSetModelQueryer(pool, "org_units");
            const nodeId = await queryer.createRootNode({
                name: nodeName
            });
            console.log(
                chalk.green(
                    `Root node with name: ${nodeName} created. \nId: ${nodeId}`
                )
            );
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);
