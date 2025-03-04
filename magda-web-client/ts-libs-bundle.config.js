const path = require("path");

module.exports = {
    entry: {
        fetchWithCache: path.join(__dirname, "src/libs/fetchWithCache.ts")
    },
    output: {
        path: path.join(__dirname, "public/assets/libs"),
        filename: "[name].min.js",
        library: {
            name: "[name]", // Used for UMD module export
            type: "umd",
            export: "default"
        }
    },
    resolve: {
        extensions: [".ts", ".js"]
    },
    optimization: {
        minimize: true
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: {
                    loader: "ts-loader",
                    options: {
                        transpileOnly: false, // Ensures TypeScript emits output
                        compilerOptions: {
                            noEmit: false,
                            declaration: false
                        }
                    }
                }
            }
        ]
    }
};
