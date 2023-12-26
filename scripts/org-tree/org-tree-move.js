#!/usr/bin/env node
import { require } from "@magda/typescript-common/dist/esmUtils.js";
const pkg = require("../package.json");
import { program } from "commander";
import chalk from "chalk";
import NestedSetModelQueryer from "@magda/authorization-api/dist/NestedSetModelQueryer.js";
import getDBPool from "../db/getDBPool.js";
import getNodeIdFromNameOrId from "./getNodeIdFromNameOrId.js";

program
    .description(
        "Move the node specified and all its dependents to the specified parent node." +
            "\nIf the node name is given instead of the node Id, the first located node (and its dependents) will be moved." +
            "\nIf the parent node name is given instead of the parent node Id, the specifed node will be moved to the first located parent node."
    )
    .option("<nodeNameOrId>", "The id or name of the node to be moved")
    .option("<parentNodeNameOrId>", "The new parent node id or name")
    .version(pkg.version)
    .action(async (nodeNameOrId, parentNodeNameOrId) => {
        try {
            if (process.argv.slice(2).length < 2) {
                program.help();
            }
            nodeNameOrId = nodeNameOrId ? nodeNameOrId.trim() : "";
            if (nodeNameOrId === "")
                throw new Error("Node Name or Id can't be empty!");
            parentNodeNameOrId = parentNodeNameOrId
                ? parentNodeNameOrId.trim()
                : "";
            if (parentNodeNameOrId === "")
                throw new Error("Parent Node Name or Id can't be empty!");
            const pool = getDBPool();
            const queryer = new NestedSetModelQueryer(pool, "org_units");

            const nodeId = await getNodeIdFromNameOrId(nodeNameOrId, queryer);
            const parentNodeId = await getNodeIdFromNameOrId(
                parentNodeNameOrId,
                queryer
            );

            await queryer.moveSubTreeTo(nodeId, parentNodeId);
            console.log(
                chalk.green(
                    `The sub tree with root node Id: ${nodeId} has been moved to the new parent node (id: ${parentNodeId}).`
                )
            );
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);
