import CRC32 from "crc-32";
import { FileDetails } from "./types";

/**
 * Hash for checking exact file matches
 */

export function extractEqualHash(_input: FileDetails, array: Uint8Array) {
    return Promise.resolve({
        equalHash: CRC32.buf(array)
    });
}
