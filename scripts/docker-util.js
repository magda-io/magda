exports.getVersions = function getVersions(local, version) {
    return (
        version || [
            !local && process.env.npm_package_version
                ? process.env.npm_package_version
                : "latest"
        ]
    );
};

exports.getName = function getName() {
    return process.env.npm_package_config_docker_name
        ? process.env.npm_package_config_docker_name
        : process.env.npm_package_name
            ? process.env.npm_package_name
            : "UnnamedImage";
};

exports.getTags = function getTags(tag, local, repository) {
    if (tag === "auto") {
        return exports.getVersions().map(version => {
            const tagPrefix = exports.getRepository(local, repository);
            const name = exports.getName();

            return (tag = tagPrefix + name + ":" + version);
        });
    } else {
        return tag ? [tag] : [];
    }
};

exports.getRepository = function getRepository(local, repository) {
    return (repository && repository + "/") || (local ? "localhost:5000/" : "");
};
