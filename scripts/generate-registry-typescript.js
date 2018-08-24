#!/usr/bin/env node
var spawnSync = require("child_process").spawnSync;
const fs = require("fs-extra");
var path = require("path");

const outputDir = path.resolve(
    process.argv[3] ? process.argv[3] : "./generatedCode"
);
const swaggerJson = path.resolve(
    process.argv[2] ? process.argv[2] : "./swagger.json"
);

fs.removeSync(outputDir);

const java = spawnSync(
    "java",
    [
        "-jar",
        "./tools/swagger-codegen-cli.jar",
        "generate",
        "-l",
        "typescript-node",
        "-i",
        swaggerJson,
        "-o",
        outputDir,
        "--type-mappings",
        "Aspect=any",
        "--import-mappings",
        "Aspect=none",
        "-DsupportsES6=true"
    ],
    {
        cwd: __dirname,
        stdio: "inherit",
        shell: false
    }
);
if (java.status !== 0) {
    throw java.error;
}
