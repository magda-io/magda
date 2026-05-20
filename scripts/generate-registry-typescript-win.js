#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "fs-extra";
import path from "path";
import { __dirname as getCurDirPath } from "@magda/esm-utils";

const __dirname = getCurDirPath();
const outputDirArg = process.argv[2];

if (!outputDirArg) {
    throw new Error(
        "Missing output directory argument. Usage: generate-registry-typescript <outputDir>"
    );
}

const outputDir = path.resolve(outputDirArg);
const repoRoot = path.resolve(__dirname, "..");
const swaggerOutputDir = path.resolve(repoRoot, "magda-registry-api/generated");
const swaggerJson = path.resolve(swaggerOutputDir, "swagger.json");

function runOrThrow(command, args, options, stepName) {
    const result = spawnSync(command, args, {
        stdio: "inherit",
        ...options
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`${stepName} failed with exit code ${result.status}`);
    }
}

fs.removeSync(outputDir);

// 1) Generate swagger.json via sbt
runOrThrow(
    "sbt",
    [
        `"registryApi / runMain au.csiro.data61.magda.registry.CommandLine ${swaggerOutputDir}"`
    ],
    {
        cwd: repoRoot,
        shell: true // important for Windows to resolve sbt(.bat/.cmd) reliably
    },
    "sbt swagger generation"
);

// 2) Generate TypeScript client via swagger-codegen
runOrThrow(
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
        shell: false
    },
    "swagger-codegen generation"
);
