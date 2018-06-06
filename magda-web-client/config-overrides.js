const rewireEslint = require("react-app-rewire-eslint");

function overrideEslintOptions(options) {
    // do stuff with the eslint options...
    return options;
}

/* config-overrides.js */
module.exports = function override(config, env) {
    config = rewireEslint(config, env, overrideEslintOptions);
    return config;
};
