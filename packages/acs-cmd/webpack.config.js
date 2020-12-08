const path = require("path");
const fse = require("fs-extra");
const webpack = require("webpack");
const magdaScriptEntryDir = path.dirname(
    require.resolve("@magda/scripts/acs-cmd/index.js")
);

const entries = (() => {
    const entries = {
        "acs-cmd": path.resolve(magdaScriptEntryDir, "index.js")
    };
    items = fse.readdirSync(magdaScriptEntryDir, { encoding: "utf8" });
    if (items && items.length) {
        items.forEach((item) => {
            if (path.extname(item) !== ".js") {
                return;
            }
            if (item !== "index.js") {
                entries[item.replace(/\.js$/, "")] = path.join(
                    magdaScriptEntryDir,
                    item
                );
            }
        });
    }
    return entries;
})();

module.exports = {
    entry: entries,
    mode: "production",
    target: "node",
    module: {
        rules: [
            {
                test: /acs-cmd\/(index\.js|acs-cmd-[^\.]+\.js)$/,
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
        "../package.json": "commonjs2 ../../package.json"
    },
    output: {
        libraryTarget: "umd",
        filename: "[name].js",
        path: path.resolve(__dirname, "./bin/acs-cmd")
    }
};
