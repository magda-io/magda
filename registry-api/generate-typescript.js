var spawnSync = require("child_process").spawnSync;

spawnSync(
  "sbt",
  [
    "registryApi/runMain au.csiro.data61.magda.registry.CommandLine ./registry-api/generated/swagger.json"
  ],
  {
    cwd: "..",
    stdio: "inherit",
    shell: false
  }
);

spawnSync("rm", ["-rf", "generated/typescript"], {
  cwd: ".",
  stdio: "inherit",
  shell: false
});

spawnSync(
  "java",
  [
    "-jar",
    "../tools/swagger-codegen-cli.jar",
    "generate",
    "-l",
    "typescript-node",
    "-i",
    "generated/swagger.json",
    "-o",
    "generated/typescript",
    "--type-mappings",
    "Aspect=any,JsonPatch=any,Operation=none",
    "-DsupportsES6=true\\"
  ],
  {
    cwd: ".",
    stdio: "inherit",
    shell: false
  }
);
