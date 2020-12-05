const path = require("path");
const webpack = require("webpack");
const magdaScriptEntry = require.resolve(
    "@magda/scripts/acs-cmd/acs-cmd-jwt.js"
);

module.exports = {
    entry: magdaScriptEntry,
    mode: "production",
    target: "node",
    module: {
        rules: [
            {
                test: /acs-cmd\/acs-cmd-jwt.js/,
                use: ["remove-hashbag-loader"]
            }
        ]
    },
    stats: "errors-only",
    optimization: {
        minimize: false
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
    externals: {
        "fs-extra": "commonjs2 fs-extra",
        chalk: "commonjs2 chalk",
        commander: "commonjs2 commander",
        pg: "commonjs2 pg",
        jsonwebtoken: "commonjs2 jsonwebtoken",
        table: "commonjs2 table",
        "../package.json": "commonjs2 ../package.json"
    },
    output: {
        libraryTarget: "umd",
        filename: "acs-cmd-jwt.js",
        path: path.resolve(__dirname, "./bin/acs-cmd")
    }
};
