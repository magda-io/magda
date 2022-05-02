import urijs from "urijs";

/**
 * Join `url` with `baseUrl` if `url` is not an absolute (full) url string
 *
 * @export
 * @param {string} url A full url string or a url path string (/a/b/c).
 * @param {string} baseUrl A baseUrl used to generate a full url when a url path string is supplied via the `url` parameter.
 * @param {{ [key: string]: any }} [optionalQueries]
 * @param {string[]} [allowedUrlHosts] Optional; when specify, the host of `url` parameter will only be used if it is included by this list.
 * @returns
 */
export default function getAbsoluteUrl(
    url: string,
    baseUrl: string,
    optionalQueries?: { [key: string]: any },
    allowedUrlHosts?: string[]
) {
    const uri = urijs(url);
    const urlHost = uri.host();
    if (urlHost) {
        // --- absolute url, return directly only if the urlHost is included by `allowedUrlHosts` (unless `allowedUrlHosts` is not supplied)
        if (
            !allowedUrlHosts ||
            allowedUrlHosts.findIndex((item) => item === urlHost) !== -1
        ) {
            return url;
        }
    }
    // ignore url host of `host` if any and use `baseUrl` to create the final full url string
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
