export function getVersions(local, version) {
    return (
        version || [
            !local && process.env.npm_package_version
                ? process.env.npm_package_version
                : "latest"
        ]
    );
}

export function getName(name) {
    if (name && typeof name === "string") {
        return name;
    }
    return process.env.npm_package_config_docker_name
        ? process.env.npm_package_config_docker_name
        : process.env.npm_package_name
        ? "data61/magda-" + process.env.npm_package_name.split("/")[1]
        : "UnnamedImage";
}

export function getTags(tag, local, repository, version, name) {
    if (tag === "auto") {
        return getVersions(local, version).map((version) => {
            const tagPrefix = getRepository(local, repository);
            const imageName = getName(name);

            return tagPrefix + imageName + ":" + version;
        });
    } else {
        return tag ? [tag] : [];
    }
}

export function getRepository(local, repository) {
    return (repository && repository + "/") || (local ? "localhost:5000/" : "");
}
