const { isEqual } = require("lodash");

module.exports = {
    webpack: {
        configure(webpackConfig) {
            const updatedRules = webpackConfig.module.rules.filter(
                rule => !isEqual(rule, { parser: { requireEnsure: false } })
            );
            webpackConfig.module.rules = updatedRules;

            // webpackConfig.plugins = webpackConfig.plugins.filter(plugin => {
            //     return plugin.constructor.name !== "ForkTSCheckerWebpackPlugin";
            // });

            return webpackConfig;
        }
    }
};
