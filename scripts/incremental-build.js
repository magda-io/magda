const childProcess = require("child_process");
const getAllPackages = require('./getAllPackages');
const isTypeScriptPackage = require('./isTypeScriptPackage');
const lastModifiedFile = require('./lastModifiedFile');
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
    const name = package.packageJson.name;

    let needsBuild = edges.findIndex(edge => edge[0] === package && edge[1].built === true) >= 0;
    if (needsBuild) {
        console.log(`${name}: building because a dependency changed`);
    } else {
        const srcLastModified = lastModifiedFile(path.resolve(packagePath, 'src'));
        const distLastModified = lastModifiedFile(path.resolve(packagePath, 'dist'));

        if (!srcLastModified) {
            console.log(`${name}: no files in src directory`);
            return;
        }

        if (!distLastModified) {
            console.log(`${name}: no previous build`);
            needsBuild = true;
        } else if (distLastModified && srcLastModified.stats.mtime > distLastModified.stats.mtime) {
            console.log(`${name}: changed since last build`);
            needsBuild = true;
        } else {
            console.log(`${name}: build is up to date`);
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
