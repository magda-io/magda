var CRC32 = require("crc-32");

/**
 * Hash for checking exact file matches
 */

export function extractEqualHash(input, output) {
    output.equalHash = CRC32.buf(input.array);
}
