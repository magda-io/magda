const path = require('path');
const spawnSync = require("child_process").spawnSync;
const packageJson = require('../package.json')

const registryDatastoreDir = path.join(__dirname, "..", "magda-registry-datastore");

const isLocal = process.argv[2] === '--local';
const imgBase = isLocal ? 'localhost:5000/' : '';
const version = isLocal ? 'latest' : packageJson.version;

spawnSync("docker", ["build", "-t", imgBase + "data61/magda-registry-datastore:" + version, registryDatastoreDir], {
  cwd: '..',
  stdio: "inherit",
  shell: false
});

spawnSync("docker", ["push", imgBase + "data61/magda-registry-datastore:" + version], {
  cwd: '..',
  stdio: "inherit",
  shell: false
});