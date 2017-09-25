const path = require('path');

module.exports = {
    entry: './src/createConnectorForBrowser.ts',
    output: {
        filename: 'createConnectorForBrowser.js',
        path: path.join(__dirname, '..', 'web'),
        library: 'Connector'
    },
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                loader: 'ts-loader',
                options: {
                    configFile: 'tsconfig-web.json'
                }
            }
        ]
    },
    resolve: {
        extensions: [ ".tsx", ".ts", ".js" ]
    },
};
