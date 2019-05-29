const { isEqual } = require("lodash");

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

            const updatedRules = webpackConfig.module.rules.filter(
                rule => !isEqual(rule, { parser: { requireEnsure: false } })
            );
            webpackConfig.module.rules = updatedRules;

            return webpackConfig;
        }
    }
};
