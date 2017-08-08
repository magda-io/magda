#!/usr/bin/env node

const path = require("path");
const fse = require("fs-extra");
const childProcess = require("child_process");

const lernaJson = require("../lerna.json");

const nonScalaPackages = lernaJson.packages
  .filter(function(packagePath) {
    return !fse.existsSync(path.resolve(packagePath, "build.sbt"));
  })
  .map(packagePath => {
    const packageJson = require(path.resolve(packagePath, "package.json"));
    return packageJson.name;
  });

const buildResult = childProcess.spawnSync(
  "lerna",
  [
    ...nonScalaPackages.map(package => "--scope " + package),
    "--concurrency",
    "4",
    "run",
    "build"
  ],
  {
    stdio: ["pipe", "inherit", "inherit"],
    shell: true
  }
);

if (buildResult.status > 0) {
  process.exit(buildResult.status);
}

const testResult = childProcess.spawnSync(
  "lerna",
  [
    ...nonScalaPackages.map(package => "--scope " + package),
    "--concurrency",
    "4",
    "run",
    "test"
  ],
  {
    stdio: ["pipe", "inherit", "inherit"],
    shell: true
  }
);

process.exit(testResult.status);
