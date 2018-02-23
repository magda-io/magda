#!/usr/bin/env node

const path = require("path");
const fse = require("fs-extra");
const childProcess = require("child_process");
const glob = require("glob");
const _ = require("lodash");

const lernaJson = require("../lerna.json");

// const commonPackages = [
//   "@magda/typescript-common",
//   "@magda/sleuther-framework"
// ];

// const commonResults = commonPackages.map(package =>
//   childProcess.spawnSync(
//     "lerna",
//     ["--scope ", package, "--concurrency", "4", "run", "build"],
//     {
//       stdio: ["pipe", "inherit", "inherit"],
//       shell: true
//     }
//   )
// );
const webPackages = [
    "@magda/web-client",
    "@magda/preview-map",
    "@magda/web-admin",
    "@magda/web-server"
];

const jsPackages = _(lernaJson.packages)
    .flatMap(package => glob.sync(package))
    .filter(function(packagePath) {
        return !fse.existsSync(path.resolve(packagePath, "build.sbt"));
    })
    .map(packagePath => {
        const packageJson = require(path.resolve(packagePath, "package.json"));
        return packageJson.name;
    })
    .filter(packageName => webPackages.indexOf(packageName) === -1)
    .value();

const commands = ["bootstrap", "run build", "run test"];

commands.forEach(command => {
    const result = childProcess.spawnSync(
        "lerna",
        [
            ...jsPackages.map(package => "--scope " + package),
            "--concurrency",
            "4",
            command
        ],
        {
            stdio: ["pipe", "inherit", "inherit"],
            shell: true
        }
    );

    if (result.status > 0) {
        process.exit(result.status);
    }
});

process.exit(0);
