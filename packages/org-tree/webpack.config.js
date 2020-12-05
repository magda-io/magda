const path = require("path");
const fse = require("fs-extra");
const webpack = require("webpack");
const magdaScriptEntryDir = path.dirname(
    require.resolve("@magda/scripts/org-tree/index.js")
);

const entries = (() => {
    const entries = {
        "org-tree": path.resolve(magdaScriptEntryDir, "index.js"),
        NestedSetModelQueryer: require.resolve(
            "@magda/authorization-api/dist/NestedSetModelQueryer"
        )
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
                test: /org-tree\/(index\.js|org-tree-[^\.]+\.js)$/,
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
        "../package.json": "commonjs2 ../../package.json",
        "fs-extra": "commonjs2 fs-extra",
        chalk: "commonjs2 chalk",
        commander: "commonjs2 commander",
        pg: "commonjs2 pg",
        jsonwebtoken: "commonjs2 jsonwebtoken",
        "text-treeview": "commonjs2 text-treeview",
        "@magda/authorization-api/dist/NestedSetModelQueryer":
            "commonjs2 ./NestedSetModelQueryer",
        "../db/getDBPool": "commonjs2 ../db/getDBPool",
        "./getNodeIdFromNameOrId": "commonjs2 ./getNodeIdFromNameOrId",
        "./getUserIdFromNameOrId": "commonjs2 ./getUserIdFromNameOrId"
    },
    output: {
        libraryTarget: "umd",
        filename: "[name].js",
        path: path.resolve(__dirname, "./bin/org-tree")
    }
};
