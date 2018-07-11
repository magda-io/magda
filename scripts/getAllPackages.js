const lernaJson = require("../lerna.json");
const path = require("path");

function getAllPackages() {
    return lernaJson.packages.map(relativePath =>
        path.resolve(__dirname, "..", relativePath)
    );
}

module.exports = getAllPackages;
