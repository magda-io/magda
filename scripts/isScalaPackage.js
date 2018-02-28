const fse = require("fs-extra");
const path = require("path");

function isScalaPackage(packagePath) {
    return fse.existsSync(path.resolve(packagePath, "build.sbt"));
}

module.exports = isScalaPackage;
