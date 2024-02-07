import recursiveReadDir from "recursive-readdir";
import { getCurrentDirPath } from "@magda/esm-utils";
import path from "path";
import fse from "fs-extra";
const __dirname = getCurrentDirPath();

const getNonScssFiles = async (dirPath: string) => {
    return await recursiveReadDir(dirPath, [
        "*.scss",
        "*.css",
        (file, stats) => {
            // @magda/web-client is our primary clean up target
            // we never need any js code from it
            if (file.indexOf(`/@magda/web-client/`) !== -1) {
                return false;
            }
            return false;
        }
    ]);
};

const cleanUpDir = async (dirPath: string) => {
    const files = await getNonScssFiles(dirPath);
    await Promise.all(files.map((file) => fse.remove(file)));
    console.log(`Deleting ${files.length} files from ${dirPath}...`);
};

await cleanUpDir(
    path.resolve(__dirname, "../../node_modules/@magda/web-client")
);
