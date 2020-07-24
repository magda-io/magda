/**
 * Escape special characters in JSON patch pointer (used to locate a property in target JSON data) as per:
 * https://tools.ietf.org/html/rfc6901#section-3
 *
 * @param {string} pointer a string used to locate a property in target JSON data. e.g. /a/sd/ss
 * @returns {string}
 */
function escapeJsonPatchPointer(pointer: string): string {
    return pointer.replace(/~/g, "~0").replace(/\//g, "~1");
}

export default escapeJsonPatchPointer;
