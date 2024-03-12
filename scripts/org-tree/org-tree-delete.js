#!/usr/bin/env node
import { require } from "@magda/esm-utils";
const pkg = require("../package.json");
import { program } from "commander";
import chalk from "chalk";
import NestedSetModelQueryer from "@magda/authorization-api/dist/NestedSetModelQueryer.js";
import getDBPool from "../db/getDBPool.js";
import getNodeIdFromNameOrId from "./getNodeIdFromNameOrId.js";

program
    .description(
        "Delete the node specified and all its dependents from the tree." +
            "\nIf the node name is given instead of the node Id, the first located node (and its dependents) will be removed." +
            "\nIf -o or --only switch is on, only specified node will be removed and its children (if any) " +
            "will become its parent's children."
    )
    .argument("<nodeNameOrId>", "node name or id that to be removed")
    .option(
        "-o, --only",
        "If only remove specified node and left its children (if any) to its parent"
    )
    .version(pkg.version)
    .action(async (nodeNameOrId) => {
        try {
            if (!process.argv.slice(2).length) {
                program.help();
            }
            const options = program.opts();
            nodeNameOrId = nodeNameOrId ? nodeNameOrId.trim() : "";
            if (nodeNameOrId === "")
                throw new Error("Node Name or Id can't be empty!");
            const pool = getDBPool();
            const queryer = new NestedSetModelQueryer(pool, "org_units");

            const nodeId = await getNodeIdFromNameOrId(nodeNameOrId, queryer);
            if (options.only) {
                await queryer.deleteNode(nodeId);
                console.log(
                    chalk.green(
                        `A node with id: ${nodeId} has been deleted from the tree.`
                    )
                );
            } else {
                await queryer.deleteSubTree(nodeId);
                console.log(
                    chalk.green(
                        `A node with id: ${nodeId} and all its children have been deleted from the tree.`
                    )
                );
            }
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);
