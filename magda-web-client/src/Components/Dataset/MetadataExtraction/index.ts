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

export async function runExtractors(input: ExtractorInput, output: any) {
    for (const extractor of extractors) {
        try {
            await extractor(input, output);
        } catch (e) {
            // even if one of the modules fail, we keep going
            console.error(e);
        }
    }
}
