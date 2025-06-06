import { ItemType } from "./indexSchema.js";
import { CreateEmbeddingText } from "./createEmbeddingText.js";
import { SemanticIndexerArguments } from "./commonSemanticIndexerYargs.js";

export default interface SemanticIndexerOptions {
    argv: SemanticIndexerArguments;
    id: string;
    itemType: ItemType;
    aspects?: string[];
    optionalAspects?: string[];
    formatTypes?: string[];
    createEmbeddingText: CreateEmbeddingText;
    chunkSize?: number;
    overlap?: number;
    autoDownloadFile?: boolean;
}

export function validateSemanticIndexerOptions(
    options: SemanticIndexerOptions
) {
    if (
        options.chunkSize !== undefined &&
        (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0)
    ) {
        throw new Error("'chunkSize' must be a positive integer");
    }
    if (
        options.overlap !== undefined &&
        (!Number.isInteger(options.overlap) || options.overlap < 0)
    ) {
        throw new Error("'overlap' must be a non-negative integer");
    }
    if (
        options.chunkSize &&
        options.overlap &&
        options.chunkSize <= options.overlap * 2
    ) {
        throw new Error("'overlap' must be less than half of 'chunkSize'");
    }
    if (options.itemType === "registryRecord") {
        if (!options.aspects || options.aspects.length === 0) {
            throw new Error("'aspects' is required");
        }
    }
    if (options.itemType === "storageObject") {
        if (!options.formatTypes || options.formatTypes.length === 0) {
            throw new Error("'formatTypes' is required");
        }
    }
}
