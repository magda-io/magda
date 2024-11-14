const { isEqual } = require("lodash");
const FilterWarningsPlugin = require("webpack-filter-warnings-plugin");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const IgnorePlugin = require("webpack").IgnorePlugin;
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
            // For reasons that are not entirely clear, production builds take
            // ages (over an hour in Windows/WSL) when Terser is allowed to
            // run in parallel.
            const terser = webpackConfig.optimization.minimizer.find(
                (min) => min && min.options && min.options.terserOptions
            );
            if (terser) {
                terser.options.parallel = false;
                terser.options.sourceMap =
                    process.env.GENERATE_SOURCEMAP !== "false";
            }

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
                                    /.*\/lexicon.js$/
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

            //webpackConfig.module.noParse = [/alasql/];
            webpackConfig.plugins.push(
                new IgnorePlugin({
                    resourceRegExp: /(^fs$|cptable|jszip|^es6-promise$|^net$|^tls$|^forever-agent$|^tough-cookie$|cpexcel|^path$|^request$|react-native|^vertx$)/
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
