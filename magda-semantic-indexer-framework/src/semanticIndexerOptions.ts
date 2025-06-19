import { ItemType } from "./indexSchema.js";
import { CreateEmbeddingText } from "./createEmbeddingText.js";
import { SemanticIndexerArguments } from "./commonYargs.js";
import { ChunkStrategyType } from "./chunker.js";

// User-provided options for semantic indexer
export default interface SemanticIndexerOptions {
    argv: SemanticIndexerArguments;
    id: string;
    itemType: ItemType;
    aspects?: string[];
    optionalAspects?: string[];
    formatTypes?: string[];
    createEmbeddingText: CreateEmbeddingText;
    chunkStrategy?: ChunkStrategyType;
    chunkSizeLimit?: number;
    overlap?: number;
    autoDownloadFile?: boolean;
}

export function validateSemanticIndexerOptions(
    options: SemanticIndexerOptions
) {
    if (
        options.chunkSizeLimit !== undefined &&
        (!Number.isInteger(options.chunkSizeLimit) ||
            options.chunkSizeLimit <= 0)
    ) {
        throw new Error("'chunkSizeLimit' must be a positive integer");
    }
    if (
        options.overlap !== undefined &&
        (!Number.isInteger(options.overlap) || options.overlap < 0)
    ) {
        throw new Error("'overlap' must be a non-negative integer");
    }
    if (
        options.chunkSizeLimit &&
        options.overlap &&
        options.chunkSizeLimit <= options.overlap * 2
    ) {
        throw new Error("'overlap' must be less than half of 'chunkSizeLimit'");
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
