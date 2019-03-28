const { isEqual } = require("lodash");

module.exports = {
    webpack: {
        configure(webpackConfig) {
            const updatedRules = webpackConfig.module.rules.filter(
                rule => !isEqual(rule, { parser: { requireEnsure: false } })
            );
            webpackConfig.module.rules = updatedRules;

            // For some reason the unusual structure of lexicon.js causes babel-web-server to take 20 minutes to compile.
            // Exclude it
            webpackConfig.module.rules = webpackConfig.module.rules.map(
                rule => {
                    if (rule.oneOf) {
                        rule.oneOf.forEach(rule => {
                            if (
                                rule.options &&
                                rule.options.presets &&
                                rule.options.presets.length &&
                                rule.options.presets[0].some &&
                                rule.options.presets[0].some(
                                    preset =>
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

            return webpackConfig;
        }
    }
};
