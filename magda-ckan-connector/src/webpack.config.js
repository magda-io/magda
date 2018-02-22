const path = require("path");

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
            "@magda/registry-aspects/dist": path.resolve(
                __dirname,
                "../node_modules/@magda/registry-aspects/src"
            ),
            "@magda/typescript-common/dist": path.resolve(
                __dirname,
                "../node_modules/@magda/typescript-common/src"
            )
        }
    }
};
