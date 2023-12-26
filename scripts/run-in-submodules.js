#!/usr/bin/env node

import { require } from "@magda/typescript-common/dist/esmUtils.js";
import path from "node:path";
import childProcess from "child_process";
import glob from "glob";
import _ from "lodash";
import os from "node:os";
import yargs from "yargs";

const lernaJson = require("../lerna.json");

const argv = yargs.option("filters", {
    alias: "f",
    type: "string",
    describe:
        "Paths and values to filter the package.json.magda, with separated by `=`."
}).argv;

const argFilters = argv.filters
    ? _.isArray(argv.filters)
        ? argv.filters
        : [argv.filters]
    : [];

const filters = argFilters.map((string) => {
    const splitFilter = string.split("=");
    return {
        key: splitFilter[0],
        value: splitFilter[1]
    };
});

const jsPackages = _(lernaJson.packages)
    .map((pkg) => pkg + "/package.json")
    .flatMap((pkg) => glob.sync(pkg))
    .map((packagePath) => {
        const packageJson = require(path.resolve(packagePath));
        return packageJson;
    })
    .filter(function (packageJson) {
        return filters.every(({ key, value }) => {
            return (
                _.get(packageJson.magda, key, "").toString() === value &&
                value.toString()
            );
        });
    })
    .map((packageJson) => packageJson.name)
    .value();

const result = childProcess.spawnSync(
    "lerna",
    [
        ...jsPackages.map((pkg) => "--scope " + pkg),
        "--stream",
        "--concurrency",
        os.cpus().length,
        ...argv._
    ],
    {
        stdio: "inherit",
        shell: true
    }
);

process.exit(result.status);
