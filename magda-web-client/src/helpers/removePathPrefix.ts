import urijs from "urijs";

/**
 * If the path or url string `pathOrUrl` starts with the prefix path specified by `prefixPathOrUrl`.
 * The prefix path will be removed from `pathOrUrl` and return the result.
 * Otherwise, `pathOrUrl` will be returned.
 *
 * @export
 * @param {string} pathOrUrl
 * @param {string} prefixPathOrUrl
 * @returns {string}
 */
export default function removePathPrefix(
    pathOrUrl: string,
    prefixPathOrUrl: string
): string {
    const originalUri = urijs(pathOrUrl);
    const prefixPath = urijs(prefixPathOrUrl).segment().join("/");
    const originalPath = originalUri.segment().join("/");

    if (originalPath.indexOf(prefixPath) !== 0) {
        return pathOrUrl;
    } else {
        let newUrl = originalUri
            .segment([])
            .segment(originalPath.substr(prefixPath.length))
            .toString();

        // make sure pathOrUrl's slash matches the original
        if (pathOrUrl[0] !== "/" && newUrl.length > 1) {
            newUrl = newUrl.substr(1);
        }

        if (pathOrUrl[pathOrUrl.length - 1] === "/") {
            newUrl = newUrl + "/";
        }

        return newUrl;
    }
}
