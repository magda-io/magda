import { require } from "@magda/typescript-common/dist/esmUtils.js";
const lernaJson = require("../lerna.json");
import path from "path";
import {
    __dirname as getCurDirPath,
    require
} from "@magda/typescript-common/dist/esmUtils.js";

const __dirname = getCurDirPath();

function getAllPackages() {
    return lernaJson.packages.map((relativePath) =>
        path.resolve(__dirname, "..", relativePath)
    );
}

export default getAllPackages;
