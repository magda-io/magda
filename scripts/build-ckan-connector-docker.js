const path = require('path');
const spawnSync = require("child_process").spawnSync;
const packageJson = require('../package.json')

const ckanConnectorDir = path.join(__dirname, "..", "magda-ckan-connector");

const isLocal = process.argv[2] === '--local';
const imgBase = isLocal ? 'localhost:5000/' : '';
const version = isLocal ? 'latest' : packageJson.version;

spawnSync("npm", ["install"], {
  cwd: ckanConnectorDir,
  stdio: "inherit",
  shell: false
});

spawnSync("npm", ["run", "build"], {
  cwd: ckanConnectorDir,
  stdio: "inherit",
  shell: false
});

spawnSync("docker", ["build", "-t", imgBase + "data61/magda-ckan-connector:" + version, ckanConnectorDir], {
  cwd: '..',
  stdio: "inherit",
  shell: false
});

spawnSync("docker", ["push", imgBase + "data61/magda-ckan-connector:" + version], {
  cwd: '..',
  stdio: "inherit",
  shell: false
});