import fse from "fs-extra";
import path from "path";

function isScalaPackage(packagePath) {
    return fse.existsSync(path.resolve(packagePath, "build.sbt"));
}

export default isScalaPackage;
