#!/usr/bin/env node
const fs = require("fs-extra");
const klawSync = require("klaw-sync");
const path = require("path");
const yargs = require("yargs");
const { getVersion, getName } = require("./docker-util");

const argv = yargs
    .config()
    .help()
    .option("fromPrefix", {
        describe: "The prefix of the image that will be given a new tag",
        type: "string",
        example: "registry.gitlab.com/magda-data/data61/",
        demandOption: true
    })
    .option("fromVersion", {
        describe:
            "The version of the existing image that will be given a new tag",
        type: "string",
        example: "0.0.38-RC1",
        demandOption: true
    })
    .option("toPrefix", {
        describe: "The prefix for the tag to push to",
        type: "string",
        example: "data61/",
        demandOption: true
    }).argv;

const dockerProcess = childProcess.spawnSync(
    "docker",
    [
        "tag",
        argv.fromPrefix + getName() + ":" + argv.fromVersion,
        argv.toPrefix + getName() + ":" + getTag()
    ],
    {
        stdio: ["pipe", "inherit", "inherit"],
        env: env
    }
);
