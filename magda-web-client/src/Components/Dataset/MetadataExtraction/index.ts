import extractContents from "./extractContents";
import { extractEqualHash } from "./extractEqualHash";
import { extractSimilarFingerprint } from "./extractSimilarFingerprint";
import { extractExtents } from "./extractExtents";
import { extractKeywords } from "./extractKeywords";
import { WorkBook } from "xlsx/types";
import merge from "lodash/merge";
import { TemporalCoverage, SpatialCoverage } from "../Add/DatasetAddCommon";

/**
 * Details extracted from the file on drag-drop
 */
export type FileDetails = {
    file?: File;
    arrayBuffer?: ArrayBuffer;
    array: Uint8Array;
};

/**
 * Contents of the initial extraction of the file
 */
export type ExtractedContents = {
    format?: string;
    text?: string;
    workbook?: WorkBook;
    datasetTitle?: string;
    author?: string;
    modified?: string;
    keywords?: string[];
    largeTextBlockIdentified?: boolean;
};

/**
 * A processing function that uses ExtractedContents
 */
export type Processor = (
    input: FileDetails,
    depInput: ExtractedContents
) => Promise<MetadataExtractionOutput>;

export type MetadataExtractionOutput = ExtractedContents & {
    equalHash?: number;
    similarFingerprint?: Uint32Array[];
    temporalCoverage?: TemporalCoverage;
    spatialCoverage?: SpatialCoverage;
};

export const dependentExtractors: Processor[] = [
    extractEqualHash,
    extractSimilarFingerprint,
    extractExtents,
    extractKeywords
];

export async function runExtractors(
    input: FileDetails,
    update: (progress: number) => void
): Promise<MetadataExtractionOutput> {
    const extractorCount = dependentExtractors.length + 1;

    // Extract the contents (text, XLSX workbook)
    const contents = await extractContents(input);

    // Concurrently feed the contents into various extractors that are dependent on it
    let doneCount = 0;
    const extractors = dependentExtractors.map(extractor =>
        extractor(input, contents)
            .catch(e => {
                // even if one of the modules fail, we keep going
                console.error(e);
                return {};
            })
            .then(result => {
                doneCount++;
                update((doneCount + 1) / extractorCount);
                return result;
            })
    );

    const extractorResults = await Promise.all(extractors);
    return extractorResults.reduce(merge, contents);
}
