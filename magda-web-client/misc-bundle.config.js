const path = require("path");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const { webpack } = require("webpack");
const IgnorePlugin = require("webpack").IgnorePlugin;
const ProvidePlugin = require("webpack").ProvidePlugin;

// module.exports = {
//     entry: {
//         polyfill: path.join(__dirname, "./src/polyfill.js"),
//         alasqlWorkerInit: path.join(__dirname, "./src/alasqlWorkerInit.js")
//     },
//     output: {
//         path: path.join(__dirname, "./public/assets/libs"),
//         filename: "[name].min.js"
//     },
//     module: {
//         rules: [
//             {
//                 test: /\.(js|mjs|jsx|ts|tsx)$/,
//                 loader:
//                     "./node_modules/react-scripts/node_modules/babel-loader/lib/index.js",
//                 include: path.join(__dirname, "./src"),
//                 options: {
//                     customize: path.join(
//                         __dirname,
//                         "./node_modules/babel-preset-react-app/webpack-overrides.js"
//                     ),
//                     presets: [
//                         path.join(
//                             __dirname,
//                             "./node_modules/babel-preset-react-app/index.js"
//                         )
//                     ],
//                     babelrc: false,
//                     configFile: false,
//                     cacheIdentifier:
//                         "production:babel-plugin-named-asset-import@:babel-preset-react-app@10.0.1:react-dev-utils@12.0.1:react-scripts@5.0.1",
//                     plugins: ["@babel/plugin-transform-typescript"],
//                     cacheDirectory: true,
//                     cacheCompression: false,
//                     compact: true
//                 }
//             }
//         ]
//     }
// };

module.exports = {
    entry: {
        alasqlWorkerInit: path.join(__dirname, "./src/alasqlWorkerInit.js")
    },
    output: {
        path: path.join(__dirname, "./public/assets/libs"),
        filename: "[name].min.js"
    },
    optimization: {
        minimize: false
    },
    module: {
        rules: [
            {
                test: /\.tsx?$|.js$/,
                use: [
                    {
                        loader: "ts-loader",
                        options: {
                            transpileOnly: true,
                            configFile: "../tsconfig.json"
                        }
                    }
                ],
                exclude: /node_modules/
            }
        ]
    },
    plugins: [
        new NodePolyfillPlugin(),
        new IgnorePlugin({
            resourceRegExp: /(^fs$|cptable|jszip|^es6-promise$|^net$|^tls$|^forever-agent$|^tough-cookie$|^path$|^request$|react-native|^vertx$)/
        })
    ],
    resolve: {
        extensions: [".tsx", ".ts", ".js"]
    },
    target: "webworker",
    externals: {
        alasql: "alasql",
        "alasql/dist/alasql.min.js": "alasql",
        "alasql/modules/xlsx/xlsx.js": "XLSX",
        xlsx: "XLSX"
    }
};
