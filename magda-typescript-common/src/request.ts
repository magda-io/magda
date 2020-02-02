const requestOriginal = require("request");
import readPkgUp from "read-pkg-up";
const pkg = readPkgUp.sync().pkg;

// include user agent derived from package.json in all http requests
export default requestOriginal.defaults({
    headers: {
        "User-Agent": "".concat(
            pkg.name.replace("/", "-").replace("@", ""),
            "/",
            pkg.version
        )
    }
});
