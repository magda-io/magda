const path = require("path");
const fse = require("fs-extra");

fse.mkdirSync(path.resolve(__dirname, "bin"));

const sourceDir = path.dirname(require.resolve("@magda/scripts/package.json"));
fse.copySync(
    path.resolve(sourceDir, "org-tree"),
    path.resolve(__dirname, "bin/org-tree")
);

fse.copySync(path.resolve(sourceDir, "db"), path.resolve(__dirname, "bin/db"));

fse.moveSync(
    path.resolve(__dirname, "bin/org-tree/index.js"),
    path.resolve(__dirname, "bin/org-tree/org-tree.js")
);
