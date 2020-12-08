const path = require("path");
const fse = require("fs-extra");

fse.mkdirSync(path.resolve(__dirname, "bin"));

const sourceDir = path.dirname(require.resolve("@magda/scripts/package.json"));
fse.copySync(
    path.resolve(sourceDir, "acs-cmd"),
    path.resolve(__dirname, "bin/acs-cmd")
);

fse.copySync(path.resolve(sourceDir, "db"), path.resolve(__dirname, "bin/db"));

fse.moveSync(
    path.resolve(__dirname, "bin/acs-cmd/index.js"),
    path.resolve(__dirname, "bin/acs-cmd/acs-cmd.js")
);
