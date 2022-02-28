import urijs from "urijs";

/**
 * Join `url` with `baseUrl` if `url` is not an absolute url
 *
 * @export
 * @param {string} url
 * @param {string} baseUrl
 * @param {{ [key: string]: any }} [optionalQueries] optional extra query parameters to add to the result url.
 * All values supplied will be converted into string before encoded into the url.
 * @returns
 */
export default function getAbsoluteUrl(
    url: string,
    baseUrl: string,
    optionalQueries?: { [key: string]: any }
) {
    const uri = urijs(url);
    if (uri.hostname()) {
        // --- absolute url, return directly
        return url;
    } else {
        if (typeof baseUrl !== "string") {
            baseUrl = "";
        }
        const baseUri = urijs(baseUrl);
        const query = uri.search(true);
        const mergedUri = baseUri.segmentCoded(
            baseUri.segmentCoded().concat(uri.segmentCoded())
        );

        return mergedUri
            .search({
                ...(query ? query : {}),
                ...(optionalQueries ? optionalQueries : {})
            })
            .toString();
    }
}
