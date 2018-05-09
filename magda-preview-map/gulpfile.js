/*eslint-env node*/
/*eslint no-sync: 0*/
/*eslint no-process-exit: 0*/

"use strict";

/*global require*/
// Every module required-in here must be a `dependency` in package.json, not just a `devDependency`,
// This matters if ever we have gulp tasks run from npm, especially post-install ones.
var fs = require("fs");
var gulp = require("gulp");
var gutil = require("gulp-util");
var path = require("path");

var minNode = require("./package.json").engines.node;
if (!require("semver").satisfies(process.version, minNode)) {
    console.log(
        "Terria requires Node.js " +
            minNode +
            " to build. Please update your version of Node.js, delete your node_modules directory" +
            ", then run npm install and gulp again."
    );
    process.exit();
}

gulp.task("build", [
    "render-datasource-templates",
    "copy-terriajs-assets",
    "build-app"
]);
gulp.task("release", [
    "render-datasource-templates",
    "copy-terriajs-assets",
    "release-app",
    "make-editor-schema"
]);
gulp.task("watch", [
    "watch-datasource-templates",
    "watch-terriajs-assets",
    "watch-app"
]);
gulp.task("default", ["lint", "build"]);

var watchOptions = {
    interval: 1000
};

gulp.task(
    "build-app",
    ["check-terriajs-dependencies", "write-version"],
    function(done) {
        var runWebpack = require("terriajs/buildprocess/runWebpack.js");
        var webpack = require("webpack");
        var webpackConfig = require("./buildprocess/webpack.config.js")(true);

        checkForDuplicateCesium();

        runWebpack(webpack, webpackConfig, done);
    }
);

gulp.task(
    "release-app",
    ["check-terriajs-dependencies", "write-version"],
    function(done) {
        var runWebpack = require("terriajs/buildprocess/runWebpack.js");
        var webpack = require("webpack");
        var webpackConfig = require("./buildprocess/webpack.config.js")(false);

        checkForDuplicateCesium();

        runWebpack(
            webpack,
            Object.assign({}, webpackConfig, {
                plugins: [
                    new webpack.optimize.UglifyJsPlugin({ sourceMap: true }),
                    new webpack.optimize.OccurrenceOrderPlugin()
                ].concat(webpackConfig.plugins || [])
            }),
            done
        );
    }
);

gulp.task("watch-app", ["check-terriajs-dependencies"], function(done) {
    var fs = require("fs");
    var watchWebpack = require("terriajs/buildprocess/watchWebpack");
    var webpack = require("webpack");
    var webpackConfig = require("./buildprocess/webpack.config.js")(
        true,
        false
    );

    checkForDuplicateCesium();

    fs.writeFileSync("version.js", "module.exports = 'Development Build';");
    watchWebpack(webpack, webpackConfig, done);
});

gulp.task("copy-terriajs-assets", function() {
    var terriaWebRoot = path.join(getPackageRoot("terriajs"), "wwwroot");
    var sourceGlob = path.join(terriaWebRoot, "**");
    var destPath = path.resolve(__dirname, "wwwroot", "build", "TerriaJS");

    return gulp
        .src([sourceGlob], { base: terriaWebRoot })
        .pipe(gulp.dest(destPath));
});

gulp.task("watch-terriajs-assets", ["copy-terriajs-assets"], function() {
    var terriaWebRoot = path.join(getPackageRoot("terriajs"), "wwwroot");
    var sourceGlob = path.join(terriaWebRoot, "**");

    return gulp.watch(sourceGlob, watchOptions, ["copy-terriajs-assets"]);
});

// Generate new schema for editor, and copy it over whatever version came with editor.
gulp.task("make-editor-schema", ["copy-editor"], function() {
    var generateSchema = require("generate-terriajs-schema");
    var schemaSourceGlob = require("terriajs/buildprocess/schemaSourceGlob");

    return generateSchema({
        sourceGlob: schemaSourceGlob,
        dest: "wwwroot/editor",
        noversionsubdir: true,
        editor: true,
        quiet: true
    });
});

gulp.task("copy-editor", function() {
    var glob = path.join(getPackageRoot("terriajs-catalog-editor"), "**");

    return gulp.src(glob).pipe(gulp.dest("./wwwroot/editor"));
});

gulp.task("lint", function() {
    var runExternalModule = require("terriajs/buildprocess/runExternalModule");

    runExternalModule("eslint/bin/eslint.js", [
        "-c",
        path.join(getPackageRoot("terriajs"), ".eslintrc"),
        "--ignore-pattern",
        "lib/ThirdParty",
        "--max-warnings",
        "0",
        "index.js",
        "lib"
    ]);
});

gulp.task("write-version", function() {
    var fs = require("fs");
    var spawnSync = require("child_process").spawnSync;

    // Get a version string from "git describe".
    var version = spawnSync("git", ["describe"])
        .stdout.toString()
        .trim();
    var isClean =
        spawnSync("git", ["status", "--porcelain"]).stdout.toString().length ===
        0;
    if (!isClean) {
        version += " (plus local modifications)";
    }

    fs.writeFileSync("version.js", "module.exports = '" + version + "';");
});

function getPackageRoot(packageName) {
    return path.dirname(require.resolve(packageName + "/package.json"));
}

gulp.task("make-package", function() {
    var argv = require("yargs").argv;
    var fs = require("fs-extra");
    var spawnSync = require("child_process").spawnSync;
    var json5 = require("json5");

    var packageName =
        argv.packageName ||
        process.env.npm_package_name +
            "-" +
            spawnSync("git", ["describe"])
                .stdout.toString()
                .trim();
    var packagesDir = path.join(".", "deploy", "packages");

    if (!fs.existsSync(packagesDir)) {
        fs.mkdirSync(packagesDir);
    }

    var workingDir = path.join(".", "deploy", "work");
    if (fs.existsSync(workingDir)) {
        fs.removeSync(workingDir);
    }

    fs.mkdirSync(workingDir);

    var copyOptions = {
        preserveTimestamps: true
    };

    fs.copySync("wwwroot", path.join(workingDir, "wwwroot"), copyOptions);
    fs.copySync(
        "node_modules",
        path.join(workingDir, "node_modules"),
        copyOptions
    );

    if (argv.serverConfigOverride) {
        var serverConfig = json5.parse(
            fs.readFileSync("devserverconfig.json", "utf8")
        );
        var serverConfigOverride = json5.parse(
            fs.readFileSync(argv.serverConfigOverride, "utf8")
        );
        var productionServerConfig = mergeConfigs(
            serverConfig,
            serverConfigOverride
        );
        fs.writeFileSync(
            path.join(workingDir, "productionserverconfig.json"),
            JSON.stringify(productionServerConfig, undefined, "  ")
        );
    } else {
        fs.writeFileSync(
            path.join(workingDir, "productionserverconfig.json"),
            fs.readFileSync("devserverconfig.json", "utf8")
        );
    }

    if (argv.clientConfigOverride) {
        var clientConfig = json5.parse(
            fs.readFileSync(path.join("wwwroot", "config.json"), "utf8")
        );
        var clientConfigOverride = json5.parse(
            fs.readFileSync(argv.clientConfigOverride, "utf8")
        );
        var productionClientConfig = mergeConfigs(
            clientConfig,
            clientConfigOverride
        );
        fs.writeFileSync(
            path.join(workingDir, "wwwroot", "config.json"),
            JSON.stringify(productionClientConfig, undefined, "  ")
        );
    }

    var tarResult = spawnSync(
        "tar",
        ["czf", path.join("..", "packages", packageName + ".tar.gz")].concat(
            fs.readdirSync(workingDir)
        ),
        {
            cwd: workingDir,
            stdio: "inherit",
            shell: false
        }
    );
    if (tarResult.status !== 0) {
        throw new gutil.PluginError(
            "tar",
            "External module exited with an error.",
            { showStack: false }
        );
    }
});

gulp.task("clean", function() {
    var fs = require("fs-extra");

    // // Remove build products
    fs.removeSync(path.join("wwwroot", "build"));
});

function mergeConfigs(original, override) {
    var result = Object.assign({}, original);

    if (typeof original === "undefined") {
        original = {};
    }

    for (var name in override) {
        if (!override.hasOwnProperty(name)) {
            continue;
        }

        if (Array.isArray(override[name])) {
            result[name] = override[name];
        } else if (typeof override[name] === "object") {
            result[name] = mergeConfigs(original[name], override[name]);
        } else {
            result[name] = override[name];
        }
    }

    return result;
}

/*
    Use EJS to render "datasources/foo.ejs" to "wwwroot/init/foo.json". Include files should be
    stored in "datasources/includes/blah.ejs". You can refer to an include file as:

    <%- include includes/foo %>

    If you want to pass parameters to the included file, do this instead:

    <%- include('includes/foo', { name: 'Cool layer' } %>

    and in includes/foo:

    "name": "<%= name %>"
 */
gulp.task("render-datasource-templates", function() {
    var ejs = require("ejs");
    var JSON5 = require("json5");
    var templateDir = "datasources";
    try {
        fs.accessSync(templateDir);
    } catch (e) {
        // Datasources directory doesn't exist? No problem.
        return;
    }
    fs.readdirSync(templateDir).forEach(function(filename) {
        if (filename.match(/\.ejs$/)) {
            var templateFilename = path.join(templateDir, filename);
            var template = fs.readFileSync(templateFilename, "utf8");
            var result = ejs.render(template, null, {
                filename: templateFilename
            });

            // Remove all new lines. This means you can add newlines to help keep source files manageable, without breaking your JSON.
            // If you want actual new lines displayed somewhere, you should probably use <br/> if it's HTML, or \n\n if it's Markdown.
            //result = result.replace(/(?:\r\n|\r|\n)/g, '');

            var outFilename = filename.replace(".ejs", ".json");
            try {
                // Replace "2" here with "0" to minify.
                result = JSON.stringify(JSON5.parse(result), null, 2);
                console.log("Rendered template " + outFilename);
            } catch (e) {
                console.warn(
                    "Warning: Rendered template " +
                        outFilename +
                        " is not valid JSON"
                );
            }
            fs.writeFileSync(
                path.join("wwwroot/init", outFilename),
                new Buffer(result)
            );
        }
    });
});

gulp.task(
    "watch-datasource-templates",
    ["render-datasource-templates"],
    function() {
        return gulp.watch(
            ["datasources/**/*.ejs", "datasources/*.json"],
            watchOptions,
            ["render-datasource-templates"]
        );
    }
);

gulp.task("sync-terriajs-dependencies", function() {
    var appPackageJson = require("./package.json");
    var terriaPackageJson = require("terriajs/package.json");

    syncDependencies(appPackageJson.dependencies, terriaPackageJson);
    syncDependencies(appPackageJson.devDependencies, terriaPackageJson);

    fs.writeFileSync(
        "./package.json",
        JSON.stringify(appPackageJson, undefined, "  ")
    );
});

gulp.task("check-terriajs-dependencies", function() {
    var appPackageJson = require("./package.json");
    var terriaPackageJson = require("terriajs/package.json");

    syncDependencies(appPackageJson.dependencies, terriaPackageJson, true);
    syncDependencies(appPackageJson.devDependencies, terriaPackageJson, true);
});

function syncDependencies(dependencies, targetJson, justWarn) {
    for (var dependency in dependencies) {
        if (dependencies.hasOwnProperty(dependency)) {
            var version =
                targetJson.dependencies[dependency] ||
                targetJson.devDependencies[dependency];
            if (version && version !== dependencies[dependency]) {
                if (justWarn) {
                    console.warn(
                        "Warning: There is a version mismatch for " +
                            dependency +
                            ". This build may fail or hang. You should run `gulp sync-terriajs-dependencies`, then re-run `npm install`, then run gulp again."
                    );
                } else {
                    console.log(
                        "Updating " +
                            dependency +
                            " from " +
                            dependencies[dependency] +
                            " to " +
                            version +
                            "."
                    );
                    dependencies[dependency] = version;
                }
            }
        }
    }
}

function checkForDuplicateCesium() {
    var fse = require("fs-extra");

    if (
        fse.existsSync("node_modules/terriajs-cesium") &&
        fse.existsSync("node_modules/terriajs/node_modules/terriajs-cesium")
    ) {
        console.log(
            "You have two copies of terriajs-cesium, one in this application's node_modules\n" +
                "directory and the other in node_modules/terriajs/node_modules/terriajs-cesium.\n" +
                "This leads to strange problems, such as knockout observables not working.\n" +
                "Please verify that node_modules/terriajs-cesium is the correct version and\n" +
                "  rm -rf node_modules/terriajs/node_modules/terriajs-cesium\n" +
                "Also consider running:\n" +
                "  yarn run gulp sync-terriajs-dependencies\n" +
                "to prevent this problem from recurring the next time you `npm install`."
        );
        throw new gutil.PluginError(
            "checkForDuplicateCesium",
            "You have two copies of Cesium.",
            { showStack: false }
        );
    }
}
