const { isEqual } = require("lodash");
const FilterWarningsPlugin = require("webpack-filter-warnings-plugin");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const IgnorePlugin = require("webpack").IgnorePlugin;
const TerserPlugin = require("terser-webpack-plugin");
const path = require("path");

require("dotenv").config();
if (process.env.NODE_PATH && !path.isAbsolute(process.env.NODE_PATH)) {
    process.env.NODE_PATH = path.resolve(__dirname, process.env.NODE_PATH);
}
if (process.env.SASS_PATH && !path.isAbsolute(process.env.SASS_PATH)) {
    process.env.SASS_PATH = path.resolve(__dirname, process.env.SASS_PATH);
}

module.exports = {
    babel: {
        //plugins: ["@babel/plugin-proposal-optional-chaining"]
    },
    webpack: {
        configure(webpackConfig) {
            const minimizers = webpackConfig.optimization.minimizer.filter(
                (min) => !(min instanceof TerserPlugin)
            );
            webpackConfig.optimization.minimizer = [
                new TerserPlugin({
                    exclude: /alasql/
                }),
                ...minimizers
            ];

            const updatedRules = webpackConfig.module.rules.filter(
                (rule) => !isEqual(rule, { parser: { requireEnsure: false } })
            );
            webpackConfig.module.rules = updatedRules;

            // For some reason the unusual structure of lexicon.js causes babel-web-server to take 20 minutes to compile.
            // Exclude it
            webpackConfig.module.rules = webpackConfig.module.rules.map(
                (rule) => {
                    if (rule.oneOf) {
                        rule.oneOf.forEach((rule) => {
                            if (
                                rule.options &&
                                rule.options.presets &&
                                rule.options.presets.length &&
                                rule.options.presets[0].some &&
                                rule.options.presets[0].some(
                                    (preset) =>
                                        preset.indexOf(
                                            "babel-preset-react-app"
                                        ) > -1
                                ) &&
                                !rule.include
                            ) {
                                rule.exclude = [
                                    rule.exclude,
                                    /.*\/lexicon.js$/,
                                    /alasql.min.js$/
                                ];
                            }
                        });
                    }

                    return rule;
                }
            );

            // --- mute warnings from mini-css-extract-plugin regarding css order
            // --- css order not always matter. Plus, complete avoid this issue probably require a new way of including component scss files
            webpackConfig.plugins.push(
                new FilterWarningsPlugin({
                    exclude: /mini-css-extract-plugin[^]*Conflicting order between:/
                })
            );

            webpackConfig.plugins.push(new NodePolyfillPlugin());

            webpackConfig.module.noParse = [/dist\/alasql\.min\.js$/];
            webpackConfig.plugins.push(
                new IgnorePlugin({
                    resourceRegExp: /(^fs$|cptable|^es6-promise$|^net$|^tls$|^forever-agent$|^tough-cookie$|^path$|^request$|react-native|^vertx$)/
                })
            );

            webpackConfig.externals = {
                react: "React",
                "react-dom": "ReactDOM",
                "react-router": "ReactRouter",
                "react-router-dom": "ReactRouterDOM"
            };

            webpackConfig.stats = "verbose";

            // auto-detect public path of compiled assets
            webpackConfig.output.publicPath = "auto";

            return webpackConfig;
        }
    }
};
