const { isEqual, set } = require("lodash");

const cssOnly = process.env.BUILD_CSS_ONLY === "true";

module.exports = {
    webpack: {
        configure(webpackConfig) {
            // For reasons that are not entirely clear, production builds take
            // ages (over an hour in Windows/WSL) when Terser is allowed to
            // run in parallel.
            const terser = webpackConfig.optimization.minimizer.find(
                min => min && min.options && min.options.terserOptions
            );
            if (terser) {
                terser.options.parallel = false;
            }

            if (cssOnly) {
                // If we're only builiing css we don't need a bunch of plugins
                webpackConfig.plugins = webpackConfig.plugins.filter(plugin => {
                    const name = plugin => plugin.constructor.name;
                    return (
                        name !== "HtmlWebpackPlugin" &&
                        name !== "InlineChunkHtmlPlugin" &&
                        name !== "InterpolateHtmlPlugin" &&
                        name !== "ManifestPlugin" &&
                        name !== "GenerateSW" &&
                        name !== "ForkTsCheckerWebpackPlugin"
                    );
                });
            }

            const filterRule = rule => {
                // CSS only doesn't need eslint
                if (cssOnly && doesLoaderInclude("eslint")) {
                    return false;
                }

                if (isEqual(rule, { parser: { requireEnsure: false } })) {
                    return false;
                }

                return true;
            };

            const forEveryRule = rule => {
                if (rule.oneOf) {
                    rule.oneOf = rule.oneOf.filter(filterRule);
                    rule.oneOf.forEach(forEveryRule);
                }

                // For some reason the unusual structure of lexicon.js causes babel-web-server to take 20 minutes to compile.
                // Exclude it
                if (
                    rule.options &&
                    rule.options.presets &&
                    rule.options.presets.length &&
                    rule.options.presets[0].some &&
                    rule.options.presets[0].some(
                        preset => preset.indexOf("babel-preset-react-app") > -1
                    ) &&
                    !rule.include
                ) {
                    rule.exclude = [rule.exclude, /.*\/lexicon.js$/];
                }
            };
            webpackConfig.module.rules = webpackConfig.module.rules.filter(
                filterRule
            );
            webpackConfig.module.rules.forEach(forEveryRule);

            if (cssOnly) {
                // Make all the css come out as one file
                set(
                    webpackConfig,
                    "optimization.splitChunks.cacheGroups.styles",
                    {
                        name: "styles",
                        test: /\.s?css$/,
                        chunks: "all",
                        enforce: true
                    }
                );
                webpackConfig.optimization.minimizer = webpackConfig.optimization.minimizer.filter(
                    minimizer => !minimizer.options.terserOptions
                );
                webpackConfig.devtool = "none";
            }

            return webpackConfig;
        }
    }
};

function doesLoaderInclude(rule, string) {
    const loaderObjs = [
        rule.loader,
        ...(rule.loaders || []),
        ...(rule.use || [])
    ].filter(x => !!x);
    const loaderPaths = loaderObjs.map(loader =>
        typeof loader === "string" ? loader : loader.loader
    );
    return loaderPaths.some(loaderPath => loaderPath.indexOf(string) >= 0);
}
