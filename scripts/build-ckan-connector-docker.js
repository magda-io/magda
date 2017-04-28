const path = require('path');
const spawnSync = require("child_process").spawnSync;

const ckanConnectorDir = path.join(__dirname, "..", "CkanConnector");

spawnSync("npm", ["run", "build"], {
  cwd: ckanConnectorDir,
  stdio: "inherit",
  shell: false
});

spawnSync("docker", ["build", "-t", "localhost:5000/data61/magda-ckan-connector:latest", ckanConnectorDir], {
  cwd: '..',
  stdio: "inherit",
  shell: false
});

spawnSync("docker", ["push", "localhost:5000/data61/magda-ckan-connector:latest"], {
  cwd: '..',
  stdio: "inherit",
  shell: false
});