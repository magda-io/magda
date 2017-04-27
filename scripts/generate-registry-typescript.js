const fse = require('fs-extra');
const path = require('path');
const spawnSync = require("child_process").spawnSync;

const scriptsDir = __dirname
const generatedDir = path.join(scriptsDir, '../registry-api/generated');

const sbt = spawnSync(
  "sbt",
  [
    '"registryApi/runMain au.csiro.data61.magda.registry.CommandLine ./registry-api/generated/swagger.json"'
  ],
  {
    cwd: path.join(scriptsDir, '..'),
    stdio: "inherit",
    shell: true
  }
);
if (sbt.status !== 0) {
    throw sbt.error;
}

fse.removeSync(path.join(generatedDir, 'typescript'));

const java = spawnSync(
  "java",
  [
    "-jar",
    "../tools/swagger-codegen-cli.jar",
    "generate",
    "-l",
    "typescript-node",
    "-i",
    "../registry-api/generated/swagger.json",
    "-o",
    "../registry-api/generated/typescript",
    "--type-mappings",
    "Aspect=any,JsonPatch=any",
    "--import-mappings",
    "Aspect=none,JsonPatch=none,Operation=none",
    "-DsupportsES6=true"
  ],
  {
    cwd: scriptsDir,
    stdio: "inherit",
    shell: false
  }
);
if (java.status !== 0) {
    throw java.error;
}
