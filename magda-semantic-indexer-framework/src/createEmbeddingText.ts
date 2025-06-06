import { Record } from "magda-typescript-common/src/generated/registry/api.js";

export type EmbeddingText = {
    text: string;
    subObjects?: Array<{
        subObjectId?: string;
        subObjectType?: string;
        text: string;
    }>;
};

export type CreateEmbeddingTextParams = {
    record: Record;
    format: string | null;
    filePath: string | null;
    url: string | null;
};

export type CreateEmbeddingText = (
    params: CreateEmbeddingTextParams
) => Promise<EmbeddingText>;
