import urijs from "urijs";

/**
 * Get basePath from given URL.
 * e.g. http://example.com or http://example.com/ will return "/"
 * http://example.com/sds/sdsd or http://example.com/sds/sdsd/ will return "/sds/sdsd"
 *
 * @export
 * @param {string} url
 * @returns {string}
 */
export default function getBasePathFromUrl(url: string): string {
    if (!url) {
        return "/";
    }
    return (
        "/" +
        urijs(url)
            .segment()
            .filter((key) => key !== "")
            .join("/")
    );
}
