#!/usr/bin/env node

const childProcess = require("child_process");
const fse = require("fs-extra");
const path = require("path");
const process = require("process");
const yargs = require("yargs");
const _ = require("lodash");
const {
    getVersions,
    getTags,
    getName,
    getRepository
} = require("./docker-util");

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
            type: "string",
            default: "auto"
        },
        repository: {
            description:
                "The repository to use in auto tag generation. Will default to '', i.e. dockerhub unless --local is set. Requires --tag=auto",
            type: "string"
        },
        version: {
            description:
                "The version(s) to use in auto tag generation. Will default to the current version in package.json. Requires --tag=auto",
            type: "string",
            array: true
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
        },
        cacheFromVersion: {
            description:
                "Version to cache from when building, using the --cache-from field in docker. Will use the same repository and name. Using this options causes the image to be pulled before build.",
            type: "string"
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
    const cacheFromImage =
        argv.cacheFromVersion &&
        getRepository(argv.local, argv.repository) +
            getName() +
            ":" +
            argv.cacheFromVersion;

    if (cacheFromImage) {
        // Pull this image into the docker daemon - if it fails we don't care, we'll just go from scratch.
        const dockerPullProcess = childProcess.spawnSync(
            "docker",
            [...extraParameters, "pull", cacheFromImage],
            {
                stdio: "inherit",
                env: env
            }
        );
        wrapConsoleOutput(dockerPullProcess);
    }

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
    const tags = getTags(argv.tag, argv.local, argv.repository, argv.version);
    const tagArgs = tags
        .map(tag => ["-t", tag])
        .reduce((soFar, tagArgs) => soFar.concat(tagArgs), []);

    const cacheFromArgs = cacheFromImage
        ? ["--cache-from", cacheFromImage]
        : [];

    const dockerProcess = childProcess.spawn(
        "docker",
        [
            ...extraParameters,
            "build",
            ...tagArgs,
            ...cacheFromArgs,
            "-f",
            `./component/Dockerfile`,
            "-"
        ],
        {
            stdio: ["pipe", "inherit", "inherit"],
            env: env
        }
    );

    wrapConsoleOutput(dockerProcess);

    dockerProcess.on("close", code => {
        fse.removeSync(dockerContextDir);

        if (code === 0 && argv.push) {
            if (tags.length === 0) {
                console.error("Can not push an image without a tag.");
                process.exit(1);
            }

            // Stop if there's a code !== 0
            tags.every(tag => {
                const process = childProcess.spawnSync(
                    "docker",
                    ["push", tag],
                    {
                        stdio: "inherit"
                    }
                );

                code = process.status;

                return code === 0;
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

function updateDockerFile(sourceDir, destDir) {
    const tags = getVersions(argv.local, argv.version);
    console.log(tags);
    const repository = getRepository(argv.local, argv.repository);
    const dockerFileContents = fse.readFileSync(
        path.resolve(sourceDir, "Dockerfile"),
        "utf-8"
    );
    const replacedDockerFileContents = dockerFileContents
        // Add a repository if this is a magda image
        .replace(
            /FROM (.*magda-[^:\s]+)(:[^\s]+)/,
            "FROM " + repository + "$1" + (tags[0] ? ":" + tags[0] : "$2")
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

                const productionPackages = _.uniqBy(
                    getPackageList(
                        null,
                        jsonYarnList.data.trees,
                        packageJson.name,
                        path.resolve(packageDir, "node_modules"),
                        []
                    ),
                    package => package.path
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
    productionPackages.forEach(src => {
        const relativePath = path.relative(packageDir, src.path);
        const dest = path.resolve(destDir, relativePath);
        const srcPath = path.resolve(packageDir, relativePath);

        // console.log("src " + srcPath + " to " + dest);

        try {
            const stat = fse.lstatSync(srcPath);
            const type = stat.isFile() ? "file" : "junction";
            fse.ensureSymlinkSync(srcPath, dest, type);
        } catch (e) {
            fse.copySync(srcPath, dest);
        }
    });
}

function getNameFromPackageListing(listing) {
    // Split the name to get the version (after @)
    const splitName = listing.split("@");

    // Some packages (particularly @magda) start with an @ - in this case we want the middle part
    return splitName.length === 2 ? splitName[0] : "@" + splitName[1];
}

function getPackageList(
    localChildren,
    rootPackages,
    packageName,
    basePath,
    result
) {
    // If the package that we're finding subpackages for doesn't have its own local children, find it in the root and see if that version of it has any children.
    const childrenToUse =
        localChildren ||
        (depFromRoot = rootPackages
            .filter(tree => !tree.shadow)
            .find(tree => getNameFromPackageListing(tree.name) === packageName))
            .children;

    if (!childrenToUse) {
        return result;
    }

    childrenToUse.forEach(function(dependencyDetails) {
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
            if (dependencyName === "fsevents") {
                // --- ignore `fsevents` module
                // --- as it's not availble on linux
                return;
            }
            throw new Error("Could not find path for " + dependencyName);
        }

        result.push({ name: dependencyName, path: dependencyDir });

        // Now that we've added this package to the list to resolve, add all its children.
        getPackageList(
            dependencyDetails.children,
            rootPackages,
            dependencyName,
            path.resolve(dependencyDir, "node_modules"),
            result
        );
    });

    return result;
}

function wrapConsoleOutput(process) {
    if (process.stdout) {
        process.stdout.on("data", data => {
            console.log(data.toString());
        });
    }
    if (process.stderr) {
        process.stderr.on("data", data => {
            console.error(data.toString());
        });
    }
}
