const path = require("path");

module.exports = {
    entry: {
        React: "react",
        ReactDOM: "react-dom"
    },
    output: {
        path: path.join(__dirname, "public/assets/libs"),
        filename: "[name].lib.js",
        library: ["[name]", "[name]"],
        libraryTarget: "umd"
    },
    optimization: {
        minimize: false
    }
};
