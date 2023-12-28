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
        "Insert a node as a child node of the specified the parent node with specified name. " +
            "\nIf the parent node name is given instead of the parent node Id, the newly created child node will be inserted to the first located parent node."
    )
    .option("<parentNodeNameOrId>", "parent node id or name")
    .option("<nodeName>", "insert node name")
    .version(pkg.version)
    .action(async (parentNodeNameOrId, nodeName) => {
        try {
            if (process.argv.slice(2).length < 2) {
                program.help();
            }
            nodeName = nodeName ? nodeName.trim() : "";
            if (nodeName === "") throw new Error("Node Name can't be empty!");
            parentNodeNameOrId = parentNodeNameOrId
                ? parentNodeNameOrId.trim()
                : "";
            if (parentNodeNameOrId === "")
                throw new Error("Parent Node Name or Id can't be empty!");
            const pool = getDBPool();
            const queryer = new NestedSetModelQueryer(pool, "org_units");

            const parentNodeId = await getNodeIdFromNameOrId(
                parentNodeNameOrId,
                queryer
            );
            const nodeId = await queryer.insertNode(parentNodeId, {
                name: nodeName
            });
            console.log(
                chalk.green(
                    `A node with name: ${nodeName} has been inserted to parent node. \n Id: ${nodeId}`
                )
            );
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);
