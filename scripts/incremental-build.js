const childProcess = require("child_process");
const fse = require('fs-extra');
const getAllPackages = require('./getAllPackages');
const isTypeScriptPackage = require('./isTypeScriptPackage');
const klawSync = require('klaw-sync');
const path = require('path');
const toposort = require('toposort');

const failed = [];
const succeeded = [];

const packagePaths = getAllPackages().filter(isTypeScriptPackage);
const packageList = packagePaths.map(packagePath => {
    const packageJson = require(path.resolve(packagePath, 'package.json'));
    const allDependencies = Object.assign({}, packageJson.devDependencies || {}, packageJson.dependencies || {});
    return {
        packagePath,
        packageJson,
        allDependencies,
        built: false
    };
});

const packageIndex = {};
packageList.forEach(package => {
    packageIndex[package.packageJson.name] = package;
});

const edges = [];
packageList.forEach(package => {
    Object.keys(package.allDependencies).forEach(dependency => {
        const dependencyPackage = packageIndex[dependency];
        if (dependencyPackage) {
            edges.push([package, dependencyPackage]);
        }
    });
});

const sortedPackages = toposort.array(packageList, edges).reverse();

sortedPackages.forEach(package => {
    const packagePath = package.packagePath;

    let needsBuild = edges.findIndex(edge => edge[0] === package && edge[1].built === true) >= 0;
    if (needsBuild) {
        console.log(`${packagePath}: building because a dependency changed`);
    } else {
        const srcLastModified = lastModifiedFile(path.resolve(packagePath, 'src'));
        const distLastModified = lastModifiedFile(path.resolve(packagePath, 'dist'));

        if (!srcLastModified) {
            console.log(`${packagePath}: no files in src directory`);
            return;
        }

        if (!distLastModified) {
            console.log(`${packagePath}: no previous build`);
            needsBuild = true;
        } else if (distLastModified && srcLastModified.stats.mtime > distLastModified.stats.mtime) {
            console.log(`${packagePath}: changed since last build`);
            needsBuild = true;
        } else {
            console.log(`${packagePath}: build is up to date`);
        }
    }

    if (needsBuild) {
        package.built = true;

        const result = childProcess.spawnSync(
            "npm", [ "run", "compile" ],
            {
                stdio: ["inherit", "inherit", "inherit"],
                shell: true,
                cwd: packagePath
            }
        );

        if (result.status > 0) {
            failed.push(packagePath);
            console.log(`${packagePath}: BUILD FAILED`);
        } else {
            succeeded.push(packagePath);
        }
    }
});


if (succeeded.length > 0) {
    console.log();
    console.log('The following packages were built successfully:');
    succeeded.map(s => '  ' + s).forEach(s => console.log(s));
}

if (failed.length > 0) {
    console.log();
    console.log('The following package builds FAILED:');
    failed.map(s => '  ' + s).forEach(s => console.log(s));
}


function lastModifiedFile(path) {
    if (!fse.existsSync(path)) {
        return undefined;
    }

    const files = klawSync(path, {
        nodir: true
    });

    return files.reduce((previous, current) => {
        return !previous || current.stats.mtime > previous.stats.mtime ? current : previous;
    }, undefined);
}
