const path = require("path");
const webpack = require("webpack");

const packagePath = package =>
    path.dirname(require.resolve(`${package}/package.json`));

module.exports = {
    entry: "./src/createTransformer.ts",
    output: {
        filename: "createTransformerForBrowser.js",
        path: path.join(__dirname, "..", "dist"),
        library: "createTransformer"
    },
    devtool: "source-map",
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                loader: "ts-loader",
                options: {
                    configFile: "tsconfig-web.json"
                }
            }
        ]
    },
    resolve: {
        extensions: [".tsx", ".ts", ".js"],
        // Unfortunately ts-loader current ignores the `paths` property in tsconfig.json.
        // So we accomplish the same thing with webpack aliases here.
        // https://github.com/TypeStrong/ts-loader/issues/213
        alias: {
            "@magda/registry-aspects/dist": path.join(
                packagePath("@magda/registry-aspects"),
                "src"
            ),
            "@magda/typescript-common/dist": path.join(
                packagePath("@magda/typescript-common"),
                "src"
            )
        }
    },
    node: {
        fs: "empty"
    }
};
