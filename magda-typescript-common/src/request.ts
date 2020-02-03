const requestOriginal = require("request");
import { RequestAPI, Request, CoreOptions, RequiredUriUrl } from "request";
import readPkgUp from "read-pkg-up";
const pkg = readPkgUp.sync().pkg;

// include user agent derived from package.json in all http requests
const request = requestOriginal.defaults({
    headers: {
        "User-Agent": "".concat(
            pkg.name.replace("/", "-").replace("@", ""),
            "/",
            pkg.version
        )
    }
}) as RequestAPI<Request, CoreOptions, RequiredUriUrl>;

export default request;
