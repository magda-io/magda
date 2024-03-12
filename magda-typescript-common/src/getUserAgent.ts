import readPkgUp from "read-pkg-up";
const pkg = readPkgUp.sync().pkg;

function getUserAgent() {
    if (!pkg || !pkg.name) {
        throw new Error(
            "getUserAgent: Can't locate package.json in current working directory or `name` field is empty."
        );
    }
    return "".concat(
        pkg.name.replace("/", "-").replace("@", ""),
        "/",
        pkg.version
    );
}

export default getUserAgent;
