import urijs from "urijs";

/**
 * Join `url` with `baseUrl` if `url` is not an absolute url
 *
 * @export
 * @param {string} url
 * @param {string} baseUrl
 * @param {{ [key: string]: string }} [optionalQueries]
 * @returns
 */
export default function getAbsoluteUrl(
    url: string,
    baseUrl: string,
    optionalQueries?: { [key: string]: string }
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
