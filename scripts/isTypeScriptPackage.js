const fse = require("fs-extra");
const path = require("path");

function isTypeScriptPackage(packagePath, packageJson) {
    packageJson =
        (packageJson && typeof packageJson === "object") ||
        require(path.resolve(packagePath, "package.json"));
    const devDependencies = packageJson.devDependencies || {};
    const dependencies = packageJson.dependencies || {};

    const hasTypeScriptDependency =
        devDependencies.typescript !== undefined ||
        dependencies.typescript !== undefined;
    const hasSrcDir = fse.existsSync(path.resolve(packagePath, "src"));
    const isTypeScript = hasTypeScriptDependency && hasSrcDir;

    return isTypeScript;
}

module.exports = isTypeScriptPackage;
