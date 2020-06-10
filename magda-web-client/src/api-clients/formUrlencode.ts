/**
 * Encode string as application/x-www-form-urlencoded MIME format according to rfc3986
 * `encodeURIComponent` will NOT escape A-Z a-z 0-9 - _ . ! ~ * ' ( )
 * However, the following rules applied to `application/x-www-form-urlencoded` encoding:
 * The alphanumeric characters "a" through "z", "A" through "Z" and "0" through "9" remain the same.
 *  - The special characters ".", "-", "*", and "_" remain the same.
 *  - The space character " " is converted into a plus sign "+".
 *  - All other characters are unsafe and are first converted into one or more bytes using some encoding scheme. Then each byte is represented by the 3-character string "%xy", where xy is the two-digit hexadecimal representation of the byte. The recommended encoding scheme to use is UTF-8. However, for compatibility reasons, if an encoding is not specified, then the default encoding of the platform is used.
 *
 * Based on above, this function patches the result of the `encodeURIComponent` to create valid `application/x-www-form-urlencoded` encoded string
 *
 * @export
 * @param {string} str
 * @returns {string}
 */
export default function formUrlencode(str: string): string {
    return encodeURIComponent(str)
        .replace(/%20/g, "+")
        .replace(/[!'()*]/g, function (c) {
            return "%" + c.charCodeAt(0).toString(16);
        });
}
