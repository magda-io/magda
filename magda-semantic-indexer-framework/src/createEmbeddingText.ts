import { Record } from "magda-typescript-common/src/generated/registry/api.js";
import Registry from "magda-typescript-common/src/registry/AuthorizedRegistryClient.js";

// The result that should be returned by the createEmbeddingText function
export type EmbeddingText = {
    text: string;
    subObjects?: Array<{
        subObjectId?: string;
        subObjectType?: string;
        text: string;
    }>;
};

// The parameters for the user-provided createEmbeddingText function
export type CreateEmbeddingTextParams = {
    record: Record;
    format: string | null;
    filePath: string | null;
    url: string | null;
    readonlyRegistry: Registry;
};

// The user-provided createEmbeddingText function to generate embedding text
export type CreateEmbeddingText = (
    params: CreateEmbeddingTextParams
) => Promise<EmbeddingText>;
