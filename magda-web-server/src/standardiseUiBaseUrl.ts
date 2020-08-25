/**
 * Validate `argv.uiBaseUrl` to make sure it has a leading slash, but no trailing slash
 *
 * @export
 * @param {string} uiBaseUrl
 * @returns
 */
export default function standardiseUiBaseUrl(uiBaseUrl: string) {
    if (typeof uiBaseUrl !== "string") {
        return "/";
    }

    let urlStr = uiBaseUrl.trim();
    if (!urlStr) {
        return "/";
    }

    if (urlStr === "/") {
        return urlStr;
    }

    if (urlStr.indexOf("/") !== 0) {
        urlStr = "/" + urlStr;
    }

    return urlStr.lastIndexOf("/") === urlStr.length - 1
        ? urlStr.substr(0, urlStr.length - 1)
        : urlStr;
}
