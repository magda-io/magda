const path = require("path");
const webpack = require("webpack");
const magdaScriptEntry = require.resolve(
    "@magda/scripts/create-secrets/index.js"
);

module.exports = {
    entry: magdaScriptEntry,
    mode: "production",
    target: "node",
    module: {
        rules: [
            {
                test: /create-secrets\/index.js/,
                use: ["remove-hashbag-loader"]
            }
        ]
    },
    stats: "errors-only",
    optimization: {
        minimize: true
    },
    resolve: {
        extensions: [".js"]
    },
    resolveLoader: {
        alias: {
            "remove-hashbag-loader": require.resolve(
                "@magda/scripts/loaders/remove-hashbag-loader.js"
            )
        }
    },
    plugins: [
        new webpack.BannerPlugin({ banner: "#!/usr/bin/env node", raw: true })
    ],
    output: {
        libraryTarget: "umd",
        filename: "create-secrets.js",
        path: path.resolve(__dirname, "./bin")
    }
};
