#!/usr/bin/env node
import * as fse from "fs-extra";
import * as nodemon from "nodemon";
import path from "path";
import process from "process";
import { requireResolve } from "@magda/typescript-common/dist/esmUtils.js";

const script = process.argv[2];
if (!script) {
    console.error("The name of the script to execute is required.");
    process.exit(1);
}

// Determine the paths to watch from the typescript configuration.
const watchPaths = ["src"];

const tsConfigPath = path.resolve("tsconfig.json");
if (fse.existsSync(tsConfigPath)) {
    const tsConfig = require(tsConfigPath);
    if (tsConfig.compilerOptions && tsConfig.compilerOptions.paths) {
        const paths = tsConfig.compilerOptions.paths;
        Object.keys(paths).forEach(function (key) {
            paths[key].forEach(function (path) {
                const lastStars = path.lastIndexOf("**");
                let truncatedPath = path;
                if (lastStars >= 0) {
                    truncatedPath = path.substring(0, lastStars);
                } else {
                    const lastStar = path.lastIndexOf("*");
                    if (lastStar >= 0) {
                        truncatedPath = path.substring(0, lastStar);
                    }
                }

                if (truncatedPath[0] !== ".") {
                    truncatedPath = "node_modules/" + truncatedPath;
                }
                try {
                    watchPaths.push(fse.realpathSync(truncatedPath));
                } catch (e) {}
            });
        });
    }
}

nodemon({
    script: script,
    args: process.argv.slice(3),
    watch: watchPaths,
    execMap: {
        ts: "node " + " --import tsx/esm "
    }
});

nodemon.on("log", function (l) {
    console.log(l.colour);
});
