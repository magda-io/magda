const rewireEslint = require("react-app-rewire-eslint");
const HtmlWebpackPlugin = require("html-webpack-plugin");

function overrideEslintOptions(options) {
    // do stuff with the eslint options...
    return options;
}

/* config-overrides.js */
module.exports = function override(config, env) {
    config = rewireEslint(config, env, overrideEslintOptions);
    config.plugins = config.plugins.map(item => {
        if (item.constructor.name !== "HtmlWebpackPlugin") {
            return item;
        }
        // --- stop auto inject. Will manually inject through tpl
        return new HtmlWebpackPlugin({ ...item.options, inject: false });
    });
    return config;
};
