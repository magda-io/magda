const fse = require("fs-extra");
const klawSync = require("klaw-sync");

function findLastModifiedFile(path) {
    if (!fse.existsSync(path)) {
        return undefined;
    }

    const stat = fse.statSync(path);
    if (!stat || (!stat.isFile() && !stat.isDirectory())) {
        return undefined;
    }

    if (stat.isFile()) {
        return {
            path: path,
            stats: stat
        };
    }

    const files = klawSync(path, {
        nodir: true
    });

    return files.reduce((previous, current) => {
        return !previous || current.stats.mtime > previous.stats.mtime
            ? current
            : previous;
    }, undefined);
}

module.exports = findLastModifiedFile;
