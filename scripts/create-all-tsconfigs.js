#!/usr/bin/env node
const fse = require("fs-extra");
const path = require("path");
const getAllPackages = require("./getAllPackages");
const isTypeScriptPackage = require("./isTypeScriptPackage");

getAllPackages().forEach(function(packagePath) {
    const packageJson = require(path.resolve(packagePath, "package.json"));
    const isTypeScript = isTypeScriptPackage(packagePath, packageJson);
    if (!isTypeScript) {
        return;
    }

    console.log(packagePath);

    const tsConfigBuild = {
        extends: "../tsconfig-global.json",
        compilerOptions: {
            declaration: true,
            outDir: "dist",
            baseUrl: "."
        },
        include: ["src"]
    };

    fse.writeFileSync(
        path.resolve(packagePath, "tsconfig-build.json"),
        JSON.stringify(tsConfigBuild, undefined, "    ")
    );

    const paths = {};
    const dependencies = packageJson.dependencies || {};
    Object.keys(dependencies)
        .filter(key => key.indexOf("@magda") === 0)
        .forEach(function(key) {
            paths[key + "/dist/*"] = ["./node_modules/" + key + "/src/*"];
        });

    const tsConfig = {
        extends: "./tsconfig-build.json",
        compilerOptions: {
            baseUrl: ".",
            paths: paths
        }
    };

    fse.writeFileSync(
        path.resolve(packagePath, "tsconfig.json"),
        JSON.stringify(tsConfig, undefined, "    ")
    );
});
