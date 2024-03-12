#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "fs-extra";
import path from "path";
import { __dirname as getCurDirPath, require } from "@magda/esm-utils";
const __dirname = getCurDirPath();
const outputDir = path.resolve(process.argv[2]);
const swaggerOutputDir = path.resolve(
    __dirname,
    "../magda-registry-api/generated/"
);
const swaggerJson = path.resolve(swaggerOutputDir, "swagger.json");

fs.removeSync(outputDir);

const sbt = spawnSync(
    "cat",
    [
        "/dev/null",
        "|",
        "sbt",
        '"registryApi/runMain au.csiro.data61.magda.registry.CommandLine ' +
            swaggerOutputDir +
            '"'
    ],
    {
        cwd: path.resolve(__dirname, ".."),
        stdio: "inherit",
        shell: true
    }
);

if (sbt.status !== 0) {
    throw sbt.error;
}

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
