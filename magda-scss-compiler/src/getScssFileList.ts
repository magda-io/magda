import recursiveReadDir from "recursive-readdir";
import path from "path";

const getScssFileList = async (clientRoot: string) => {
    // recursive-readdir lists files as its async stat calls complete, so sort
    // the list to make the compiled css (and the cascade) the same every run
    const files = await recursiveReadDir(clientRoot + "/src", [
        (file, stats) => {
            // --- ignore pancake directory
            if (stats.isDirectory() && path.basename(file) === "pancake") {
                return true;
            }
            // --- only list *.scss
            if (!stats.isDirectory() && path.extname(file) !== ".scss") {
                return true;
            }
            // --- ignore all "_xxx.scss" files
            if (path.basename(file)[0] === "_") {
                return true;
            }
            // --- ignore index.scss as it needs to be the first one
            if (
                !stats.isDirectory() &&
                path.dirname(file) === clientRoot + "/src" &&
                path.basename(file) === "index.scss"
            ) {
                return true;
            }
            return false;
        }
    ]);
    return files.sort();
};

export default getScssFileList;
