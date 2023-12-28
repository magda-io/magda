#!/usr/bin/env node
import { require } from "@magda/esm-utils";
const pkg = require("../package.json");
import { program } from "commander";
import chalk from "chalk";
import NestedSetModelQueryer from "@magda/authorization-api/dist/NestedSetModelQueryer.js";
import getDBPool from "../db/getDBPool.js";
import getNodeIdFromNameOrId from "./getNodeIdFromNameOrId.js";
import getUserIdFromNameOrId from "./getUserIdFromNameOrId.js";

program
    .description(
        "Assign the specified user to the nominated node." +
            "\nBoth `userNameOrId` & `nodeNameOrId` can be either entity name or Id. \n" +
            "\tIf more than one entities are located by entity name, the first one will be used."
    )
    .option("<userNameOrId>", "user name or id")
    .option("<nodeNameOrId>", "org unit node id or name")
    .version(pkg.version)
    .action(async (userNameOrId, parentNodeNameOrId) => {
        try {
            if (process.argv.slice(2).length < 2) {
                program.help();
            }
            userNameOrId = userNameOrId ? userNameOrId.trim() : "";
            if (userNameOrId === "")
                throw new Error("User Name or Id can't be empty!");
            parentNodeNameOrId = parentNodeNameOrId
                ? parentNodeNameOrId.trim()
                : "";
            if (parentNodeNameOrId === "")
                throw new Error("Parent Org Node Name or Id can't be empty!");
            const pool = getDBPool();
            const queryer = new NestedSetModelQueryer(pool, "org_units");

            const parentNodeId = await getNodeIdFromNameOrId(
                parentNodeNameOrId,
                queryer
            );

            const userId = await getUserIdFromNameOrId(userNameOrId, pool);

            await pool.query(
                `UPDATE "users" SET "orgUnitId" = $2 WHERE "id" = $1`,
                [userId, parentNodeId]
            );

            console.log(
                chalk.green(
                    `The user (id: ${userId}) has been assigned to org unit node id: ${parentNodeId}.`
                )
            );
        } catch (e) {
            console.error(chalk.red(`Error: ${e}`));
        }
        process.exit(0);
    })
    .parse(process.argv);
