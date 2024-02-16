#!/usr/bin/env node
import { require } from "@magda/esm-utils";
const pkg = require("../package.json");
import { program } from "commander";
import chalk from "chalk";
import NestedSetModelQueryer from "@magda/authorization-api/dist/NestedSetModelQueryer.js";
import getDBPool from "../db/getDBPool.js";

program
    .description(
        `Create a root tree node with specified name. You can then complete other node fields using other DB admin tools.`
    )
    .argument("<nodeName>", "Root node name")
    .version(pkg.version)
    .action(async (nodeName) => {
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
