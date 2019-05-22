// different extractors/processors
import { extractText } from "./extractText";
import { extractEqualHash } from "./extractEqualHash";
import { extractSimilarFingerprint } from "./extractSimilarFingerprint";
import { extractExtents } from "./extractExtents";
import { extractKeywords } from "./extractKeywords";

export type ExtractorInput = {
    file?: File;
    arrayBuffer?: ArrayBuffer;
    array?: Uint8Array;
};

export type Extractor = (input: ExtractorInput, output: any) => void;

// different extractors/processors
export const extractors: Extractor[] = [
    extractText,
    extractEqualHash,
    extractSimilarFingerprint,
    extractExtents,
    extractKeywords
];

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

export async function runExtractors(input: ExtractorInput, update: any) {
    for (const extractor of extractors) {
        const index = extractors.indexOf(extractor);
        try {
            console.log("Processing", index + 1, "of", extractors.length);
            const output: any = {};
            output._progress =
                ((extractors.indexOf(extractor) + 0.1) / extractors.length) *
                100;
            update(output);
            await extractor(input, output);
            output._progress =
                ((extractors.indexOf(extractor) + 1) / extractors.length) * 100;
            update(output);
            await delay(100);
        } catch (e) {
            // even if one of the modules fail, we keep going
            console.error(e);
        }
    }
}
