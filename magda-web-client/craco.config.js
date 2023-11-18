const { isEqual } = require("lodash");
const FilterWarningsPlugin = require("webpack-filter-warnings-plugin");

module.exports = {
    babel: {
        plugins: ["@babel/plugin-proposal-optional-chaining"]
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

            webpackConfig.externals = {
                react: "React",
                "react-dom": "ReactDOM",
                "react-router": "ReactRouter",
                "react-router-dom": "ReactRouterDOM"
            };

            webpackConfig.resolve.fallback = {
                zlib: require.resolve("browserify-zlib"),
                stream: require.resolve("stream-browserify")
            };

            return webpackConfig;
        }
    }
};
