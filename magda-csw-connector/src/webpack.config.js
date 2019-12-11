const path = require("path");
const webpack = require("webpack");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");

const configFile = path.resolve(__dirname, "../tsconfig.json");

module.exports = {
    entry: "./src/createTransformer.ts",
    mode: "production",
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
                    configFile,
                    projectReferences: true,
                    compilerOptions: {
                        lib: [
                            "dom",
                            "es5",
                            "scripthost",
                            "es2015.core",
                            "es2015.promise",
                            "es2017"
                        ]
                    }
                }
            }
        ]
    },
    resolve: {
        plugins: [
            new TsconfigPathsPlugin({
                configFile
            })
        ],
        extensions: [".tsx", ".ts", ".js"]
    },
    node: {
        fs: "empty"
    }
};
