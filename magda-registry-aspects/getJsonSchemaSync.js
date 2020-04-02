const path = require("path");
const fs = require("fs");

const fileContentCache = {};

function getJsonSchemaSync(schemaName) {
    let fileName = schemaName;
    const ext = path.extname(fileName);

    if (!ext || ext.toLowerCase() !== ".json") {
        fileName = fileName + ".json";
    }

    const filePath = path.resolve(__dirname, fileName);

    if (!fileContentCache[filePath]) {
        fileContentCache[filePath] = JSON.parse(
            fs.readFileSync(filePath, {
                encoding: "utf8"
            })
        );
    }

    return fileContentCache[filePath];
}

exports.getJsonSchemaSync = getJsonSchemaSync;
exports.default = getJsonSchemaSync;
