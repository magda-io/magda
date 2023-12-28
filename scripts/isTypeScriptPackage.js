import fse from "fs-extra";
import path from "path";
import { require } from "@magda/esm-utils";

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

export default isTypeScriptPackage;
