import { SpatialCoverage, TemporalCoverage } from "../Add/DatasetAddCommon";
import { WorkBook } from "xlsx/types";
import type { MessageSafeConfig } from "config";

/**
 * Details extracted from the file on drag-drop
 */
export type FileDetails = {
    fileName?: string;
    arrayBuffer: ArrayBuffer;
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
    array: Uint8Array,
    depInput: ExtractedContents,
    config: MessageSafeConfig
) => Promise<MetadataExtractionOutput>;

export type MetadataExtractionOutput = ExtractedContents & {
    equalHash?: number;
    similarFingerprint?: Uint32Array[];
    temporalCoverage?: TemporalCoverage;
    spatialCoverage?: SpatialCoverage;
};
