const path = require("path");

module.exports = {
    entry: path.join(__dirname, "src/polyfill.js"),
    output: {
        path: path.join(__dirname, "public/assets/libs"),
        filename: "polyfills.min.js"
    }
};
