const childProcess = require("child_process");
const getAllPackages = require("./getAllPackages");
const isScalaPackage = require("./isScalaPackage");
const findLastModifiedFile = require("./findLastModifiedFile");
const path = require("path");
const toposort = require("toposort");
const yargs = require("yargs");

const argv = yargs
    .config()
    .help()
    .option("skipDocker", {
        describe: "Skip the build/push of the docker image.",
        type: "boolean",
        default: false
    });

const failed = [];
const succeeded = [];

const packagePaths = getAllPackages().filter(p => !isScalaPackage(p));
const packageList = packagePaths.map(packagePath => {
    const packageJson = require(path.resolve(packagePath, "package.json"));
    const allDependencies = Object.assign(
        {},
        packageJson.devDependencies || {},
        packageJson.dependencies || {}
    );
    return {
        packagePath,
        packageJson,
        allDependencies
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

    const dependencies = edges
        .filter(edge => edge[0] === package)
        .map(edge => edge[1]);
    const lastModifiedFiles = dependencies.map(dependency =>
        findLastModifiedFile(path.resolve(dependency.packagePath, "dist"))
    );

    const srcLastModified = findLastModifiedFile(
        path.resolve(packagePath, "src")
    );
    const distLastModified =
        findLastModifiedFile(path.resolve(packagePath, "dist")) ||
        findLastModifiedFile(path.resolve(packagePath, "build"));

    if (!srcLastModified) {
        console.log(`${name}: no files in src directory`);
        return;
    }

    lastModifiedFiles.push(srcLastModified);
    const lastModifiedSourceFile = lastModifiedFiles.reduce(
        (previous, current) =>
            !previous ||
            (current &&
                current.stats &&
                current.stats.mtime > previous.stats.mtime)
                ? current
                : previous,
        undefined
    );

    if (
        lastModifiedSourceFile &&
        distLastModified.stats.mtime >= lastModifiedSourceFile.stats.mtime
    ) {
        console.log(`${name}: build is up to date`);
    } else {
        console.log(`${name}: changed since last build`);
        const result = childProcess.spawnSync("npm", ["run", "build"], {
            stdio: ["inherit", "inherit", "inherit"],
            shell: true,
            cwd: packagePath
        });

        if (result.status > 0) {
            failed.push(packagePath);
            console.log(`${packagePath}: BUILD FAILED`);
        } else {
            if (
                !argv.skipDocker &&
                package.packageJson.scripts &&
                package.packageJson.scripts["docker-build-local"]
            ) {
                const dockerResult = childProcess.spawnSync(
                    "npm",
                    ["run", "docker-build-local"],
                    {
                        stdio: ["inherit", "inherit", "inherit"],
                        shell: true,
                        cwd: packagePath
                    }
                );
                if (dockerResult.status > 0) {
                    failed.push(packagePath);
                    console.log(`${packagePath}: DOCKER BUILD FAILED`);
                } else {
                    succeeded.push(packagePath);
                }
            } else {
                succeeded.push(packagePath);
            }
        }
    }
});

if (succeeded.length > 0) {
    console.log();
    console.log("The following packages were built successfully:");
    succeeded.map(s => "  " + s).forEach(s => console.log(s));
}

if (failed.length > 0) {
    console.log();
    console.log("The following package builds FAILED:");
    failed.map(s => "  " + s).forEach(s => console.log(s));
}
