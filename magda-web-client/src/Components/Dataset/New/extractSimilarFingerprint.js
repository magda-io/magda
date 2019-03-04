/**
 * Extract a frequency histogram fingerprint for finding similar files
 */
export function extractSimilarFingerprint(input, output) {
    if (input.text) {
        output.similarFingerprint = fingerprint(txtTransform(input.text));
    } else {
        output.similarFingerprint = fingerprint(input.array);
    }
}

/**
 * Fingerprint text files in case insensitive whitespace ignoring fashion
 */
function txtTransform(text) {
    return text.replace(/\s+/g, "").toLowerCase();
}

/**
 * Calculate fingerprint
 */
function fingerprint(data) {
    const hash = new Uint32Array(256);
    hash.fill(0);
    for (let i = 0; i < data.length; i++) {
        setByte(hash, data[i]);
    }
    return hash;
}

function setByte(array, bit) {
    const index = bit % array.length;
    array[index]++;
}

// use this to order similar fingerprints - more positive the better
// function similarity(hash1, hash2) {
//     let count = 0;
//     let maxValue = 0;
//     for (let i = 0; i < hash1.length; i++) {
//         count += Math.pow(hash1[i] - hash2[i], 2);
//         maxValue = Math.max(maxValue, hash1[i], hash2[i]);
//     }
//     return Math.max(1 - Math.sqrt(count) / maxValue, 0);
// }
