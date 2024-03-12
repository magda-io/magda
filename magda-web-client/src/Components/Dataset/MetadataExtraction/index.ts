import extractContents from "./extractContents";
import { extractEqualHash } from "./extractEqualHash";
import { extractSimilarFingerprint } from "./extractSimilarFingerprint";
import { extractExtents } from "./extractExtents";
import { extractKeywords } from "./extractKeywords";
import * as Comlink from "comlink";
import merge from "lodash/merge";
import type { FileDetails, MetadataExtractionOutput, Processor } from "./types";
import type { MessageSafeConfig } from "config"; // eslint-disable-line

const dependentExtractors: Processor[] = [
    extractEqualHash,
    extractSimilarFingerprint,
    extractExtents,
    extractKeywords
];

export const extractors = {
    async runExtractors(
        input: FileDetails,
        config: MessageSafeConfig,
        update: (progress: number) => void
    ): Promise<MetadataExtractionOutput> {
        const extractorCount = dependentExtractors.length + 1;
        const array = new Uint8Array(input.arrayBuffer);

        // Extract the contents (text, XLSX workbook)
        const contents = await extractContents(input, array);

        update(1 / (extractorCount + 1));

        // Concurrently feed the contents into various extractors that are dependent on it
        let doneCount = 0;
        const extractors = dependentExtractors.map((extractor) =>
            extractor(input, array, contents, config)
                .catch((e) => {
                    // even if one of the modules fail, we keep going
                    console.error(e);
                    return {};
                })
                .then((result) => {
                    doneCount++;
                    update((doneCount + 1) / (extractorCount + 1));
                    return result;
                })
        );

        const extractorResults = await Promise.all(extractors);
        return extractorResults.reduce(merge, contents);
    }
};

Comlink.expose(extractors);
