// const tmp = require('tmp');
// const fs = require('fs-extra')
const path = require('path');
const spawnSync = require("child_process").spawnSync;

// const tempContext = tmp.dirSync();

// fs.copySync(path.join(__dirname, '..', 'CkanConnector'), tempContext);
// fs.copySync(path.join(__dirname, '..', 'CkanConnector'), tempContext);

const ckanConnectorDir = path.join(__dirname, "..", "CkanConnector");

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