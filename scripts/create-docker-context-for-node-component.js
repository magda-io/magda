#!/usr/bin/env node
const childProcess = require("child_process");
const fse = require("fs-extra");
const path = require("path");
const process = require("process");
const yargs = require("yargs");
const _ = require("lodash");

const argv = yargs
    .options({
        build: {
            description: "Pipe the Docker context straight to Docker.",
            type: "boolean",
            default: false
        },
        tag: {
            description:
                'The tag to pass to "docker build".  This parameter is only used if --build is specified.  If the value of this parameter is `auto`, a tag name is automatically created from NPM configuration.',
            type: "string"
        },
        output: {
            description:
                "The output path and filename for the Docker context .tar file.",
            type: "string"
        },
        local: {
            description:
                "Build for a local Kubernetes container registry.  This parameter is only used if --build is specified.",
            type: "boolean",
            default: false
        },
        push: {
            description:
                "Push the build image to the docker registry.  This parameter is only used if --build is specified.",
            type: "boolean",
            default: false
        }
    })
    .help().argv;

if (!argv.build && !argv.output) {
    console.log("Either --build or --output <filename> must be specified.");
    process.exit(1);
}

const componentSrcDir = path.resolve(process.cwd());
const dockerContextDir = fse.mkdtempSync(
    path.resolve(__dirname, "..", "docker-context-")
);
const componentDestDir = path.resolve(dockerContextDir, "component");

fse.emptyDirSync(dockerContextDir);
fse.ensureDirSync(componentDestDir);

preparePackage(componentSrcDir, componentDestDir);

const tar = process.platform === "darwin" ? "gtar" : "tar";

// Docker and ConEmu (an otherwise excellent console for Windows) don't get along.
// See: https://github.com/Maximus5/ConEmu/issues/958 and https://github.com/moby/moby/issues/28814
// So if we're running under ConEmu, we need to add an extra -cur_console:i parameter to disable
// ConEmu's hooks and also set ConEmuANSI to OFF so Docker doesn't do anything drastic.
const env = Object.assign({}, process.env);
const extraParameters = [];
if (env.ConEmuANSI === "ON") {
    env.ConEmuANSI = "OFF";
    extraParameters.push("-cur_console:i");
}

updateDockerFile(componentSrcDir, componentDestDir);

if (argv.build) {
    const tarProcess = childProcess.spawn(
        tar,
        [...extraParameters, "--dereference", "-czf", "-", "*"],
        {
            cwd: dockerContextDir,
            stdio: ["inherit", "pipe", "inherit"],
            env: env,
            shell: true
        }
    );
    const tag = getTag();
    const tagArgs = tag ? ["-t", tag] : [];

    const dockerProcess = childProcess.spawn(
        "docker",
        [
            ...extraParameters,
            "build",
            ...tagArgs,
            "-f",
            `./component/Dockerfile`,
            "-"
        ],
        {
            stdio: ["pipe", "inherit", "inherit"],
            env: env
        }
    );

    dockerProcess.on("close", code => {
        fse.removeSync(dockerContextDir);

        if (code === 0 && argv.push) {
            if (!tag) {
                console.error("Can not push an image without a tag.");
                process.exit(1);
            }
            childProcess.spawnSync("docker", ["push", tag], {
                stdio: "inherit"
            });
        }
        process.exit(code);
    });

    tarProcess.on("close", code => {
        dockerProcess.stdin.end();
    });

    tarProcess.stdout.on("data", data => {
        dockerProcess.stdin.write(data);
    });
} else if (argv.output) {
    const outputPath = path.resolve(process.cwd(), argv.output);

    const outputTar = fse.openSync(outputPath, "w", 0o644);

    const tarProcess = childProcess.spawn(
        tar,
        ["--dereference", "-czf", "-", "*"],
        {
            cwd: dockerContextDir,
            stdio: ["inherit", outputTar, "inherit"],
            env: env,
            shell: true
        }
    );

    tarProcess.on("close", code => {
        fse.closeSync(outputTar);
        console.log(tarProcess.status);
        fse.removeSync(dockerContextDir);
    });
}

function getVersion() {
    return !argv.local && process.env.npm_package_version
        ? process.env.npm_package_version
        : "latest";
}

function getTag() {
    let tag = argv.tag;
    if (tag === "auto") {
        const tagPrefix = argv.local ? "localhost:5000/" : "";

        const name = process.env.npm_package_config_docker_name
            ? process.env.npm_package_config_docker_name
            : process.env.npm_package_name
                ? process.env.npm_package_name
                : "UnnamedImage";
        tag = tagPrefix + name + ":" + getVersion();
    }

    return tag;
}

function updateDockerFile(sourceDir, destDir) {
    const tag = getVersion();
    const repository = argv.local ? "localhost:5000/" : "";
    const dockerFileContents = fse.readFileSync(
        path.resolve(sourceDir, "Dockerfile"),
        "utf-8"
    );
    const replacedDockerFileContents = dockerFileContents
        // Add a repository if this is a magda image
        .replace(/FROM (.*magda-.*)(\s|$)/, "FROM " + repository + "$1$2")
        // Add a tag if none specified
        .replace(
            /FROM (.+\/[^:\s]+)(\s|$)/,
            "FROM $1" + (tag ? ":" + tag : "") + "$2"
        );

    fse.writeFileSync(
        path.resolve(destDir, "Dockerfile"),
        replacedDockerFileContents,
        "utf-8"
    );
}

function preparePackage(packageDir, destDir) {
    const packageJson = require(path.join(packageDir, "package.json"));
    const dockerIncludesFromPackageJson =
        packageJson.config &&
        packageJson.config.docker &&
        packageJson.config.docker.include;

    let dockerIncludes;
    if (!dockerIncludesFromPackageJson) {
        console.log(
            `WARNING: Package ${packageDir} does not have a config.docker.include key in package.json, so all of its files will be included in the docker image.`
        );
        dockerIncludes = fse.readdirSync(packageDir);
    } else if (dockerIncludesFromPackageJson.trim() === "*") {
        dockerIncludes = fse.readdirSync(packageDir);
    } else {
        if (dockerIncludesFromPackageJson.indexOf("*") >= 0) {
            throw new Error(
                "Sorry, wildcards are not currently supported in config.docker.include."
            );
        }
        dockerIncludes = dockerIncludesFromPackageJson
            .split(" ")
            .filter(include => include.length > 0);
    }

    dockerIncludes
        .filter(include => include !== "Dockerfile") // Filter out the dockerfile because we'll manually copy over a modified version.
        .forEach(function(include) {
            const src = path.resolve(packageDir, include);
            const dest = path.resolve(destDir, include);

            if (include === "node_modules") {
                fse.ensureDirSync(dest);

                const env = Object.create(process.env);
                env.NODE_ENV = "production";

                // Get the list of production packages required by this package.
                const rawYarnList = childProcess.spawnSync(
                    "yarn",
                    ["list", "--json"],
                    {
                        encoding: "utf8",
                        cwd: packageDir,
                        shell: true,
                        env
                    }
                ).stdout;
                const jsonYarnList = JSON.parse(rawYarnList);

                const productionPackages = _.uniq(
                    getPackageList(
                        jsonYarnList.data.trees,
                        packageJson.name,
                        path.resolve(packageDir, "node_modules"),
                        []
                    )
                );

                prepareNodeModules(src, dest, productionPackages);

                return;
            }

            try {
                // On Windows we can't create symlinks to files without special permissions.
                // So just copy the file instead.  Usually creating directory junctions is
                // fine without special permissions, but fall back on copying in the unlikely
                // event that fails, too.
                const type = fse.statSync(src).isFile() ? "file" : "junction";
                fse.ensureSymlinkSync(src, dest, type);
            } catch (e) {
                fse.copySync(src, dest);
            }
        });
}

function prepareNodeModules(packageDir, destDir, productionPackages) {
    console.log("destDir " + destDir);
    productionPackages.forEach(src => {
        const dest = path.join(destDir, src.name);

        try {
            const stat = fse.lstatSync(src.path);
            const type = stat.isFile() ? "file" : "junction";
            fse.ensureSymlinkSync(src.path, dest, type);
        } catch (e) {
            fse.copySync(src.path, dest);
        }
    });
}

function getNameFromPackageListing(listing) {
    // Split the name to get the version (after @)
    const splitName = listing.split("@");

    // Some packages (particularly @magda) start with an @ - in this case we want the middle part
    return splitName.length === 2 ? splitName[0] : "@" + splitName[1];
}

function getPackageList(trees, packageName, basePath, result) {
    const dependencies = trees.filter(
        tree => getNameFromPackageListing(tree.name) === packageName
    );

    if (dependencies.length === 0 || dependencies[0].children.length === 0) {
        return result;
    }

    dependencies[0].children.forEach(function(dependencyDetails) {
        const dependencyName = getNameFromPackageListing(
            dependencyDetails.name
        );

        let dependencyDir = path.join(
            basePath,
            dependencyName.replace(/\//g, path.sep)
        );

        // Does this directory exist?  If not, imitate node's module resolution by walking
        // up the directory tree.
        while (!fse.existsSync(dependencyDir)) {
            let upOne;
            if (dependencyName.indexOf(path.sep) === -1) {
                upOne = path.resolve(
                    dependencyDir,
                    "..",
                    "..",
                    "..",
                    "node_modules",
                    dependencyName
                );
            } else {
                upOne = path.resolve(
                    dependencyDir,
                    "..",
                    "..",
                    "..",
                    "..",
                    "node_modules",
                    dependencyName
                );
            }

            if (upOne === dependencyDir) {
                break;
            }

            dependencyDir = upOne;
        }

        if (!fse.existsSync(dependencyDir)) {
            throw new Error("Could not find path for " + dependencyName);
        }

        result.push({ name: dependencyName, path: dependencyDir });

        getPackageList(
            trees,
            dependencyName,
            path.resolve(dependencyDir, "node_modules"),
            result
        );
    });

    return result;
}
