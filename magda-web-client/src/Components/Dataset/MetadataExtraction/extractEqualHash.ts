import CRC32 from "crc-32";
import { FileDetails } from ".";

/**
 * Hash for checking exact file matches
 */

export function extractEqualHash(input: FileDetails) {
    return Promise.resolve({ equalHash: CRC32.buf(input.array) });
}
