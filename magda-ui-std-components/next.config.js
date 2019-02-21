const withTypescript = require("@zeit/next-typescript");
module.exports = withTypescript({
    assetPrefix: "http://localhost:3001",
    webpack(config, options) {
        config.output = config.output || {};
        config.output.jsonpFunction = "stdComponents";
        config.plugins = config.plugins.filter(
            plugin => plugin.constructor.name !== "UglifyJsPlugin"
        );
        // Further custom configuration here
        return config;
    }
});
