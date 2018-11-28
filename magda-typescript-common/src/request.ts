import * as request from "request";
import * as readPkgUp from "read-pkg-up";
const pkg = readPkgUp.sync().pkg;

// include user agent derived from package.json in all http requests
export default request.defaults({
    headers: {
        "User-Agent": "".concat(pkg.name.replace("/", "-"), "/", pkg.version)
    }
});
