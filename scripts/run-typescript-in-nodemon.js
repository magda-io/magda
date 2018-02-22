#!/usr/bin/env node
const fse = require("fs-extra");
const nodemon = require("nodemon");
const path = require("path");
const process = require("process");

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
        Object.keys(paths).forEach(function(key) {
            paths[key].forEach(function(path) {
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
        ts:
            "node " +
            require.resolve("ts-node/dist/bin.js") +
            " -r " +
            require.resolve("tsconfig-paths/register")
    }
});

nodemon.on("log", function(l) {
    console.log(l.colour);
});
