var spawnSync = require("child_process").spawnSync;
const fs = require('fs-extra')
var path = require('path');

const outputDir = path.resolve(process.argv[2]);
const swaggerJson = path.resolve('../registry-api/generated/swagger.json');


fs.removeSync(outputDir)

spawnSync(
  "sbt",
  [
    "registryApi/runMain au.csiro.data61.magda.registry.CommandLine " + swaggerJson
  ],
  {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    shell: false
  }
);

spawnSync(
  "java",
  [
    "-jar",
    "../tools/swagger-codegen-cli.jar",
    "generate",
    "-l",
    "typescript-node",
    "-i",
    swaggerJson,
    "-o",
    outputDir,
    "--type-mappings",
    "Aspect=any,JsonPatch=any",
    "--import-mappings",
    "Aspect=none,JsonPatch=none,Operation=none",
    "-DsupportsES6=true"
  ],
  {
    cwd: __dirname,
    stdio: "inherit",
    shell: false
  }
);
