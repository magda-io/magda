import { onRecordFoundType } from "@magda/minion-framework/dist/MinionOptions.js";
import { Chunker } from "./chunker.js";
import EmbeddingApiClient from "../EmbeddingApiClient.js";
import OpensearchApiClient from "../OpensearchApiClient.js";
import SemanticIndexerOptions from "./semanticIndexerOptions.js";
import { indexEmbeddingText } from "./indexEmbeddingText.js";
import { Record } from "../generated/registry/api.js";
import { SkipError } from "./skipError.js";

export const onRecordFoundRegistryRecord = (
    userConfig: SemanticIndexerOptions,
    chunker: Chunker,
    embeddingApiClient: EmbeddingApiClient,
    opensearchApiClient: OpensearchApiClient
): onRecordFoundType => {
    return async (record: Record, _registry) => {
        try {
            if (
                !record.aspects ||
                !userConfig.aspects.every((aspect) => aspect in record.aspects)
            ) {
                return;
            }
            let embeddingText;
            try {
                embeddingText = await userConfig.createEmbeddingText({
                    record,
                    format: null,
                    filePath: null,
                    url: null
                });
            } catch (err) {
                throw new SkipError(
                    `Failed to create embedding text, error: ${
                        (err as Error).message
                    }`
                );
            }

            await indexEmbeddingText(
                userConfig,
                embeddingText,
                {
                    recordId: record.id
                },
                chunker,
                embeddingApiClient,
                opensearchApiClient
            );
        } catch (err) {
            if (err instanceof SkipError) {
                console.warn("Skipping record because:", err.message);
                return;
            }
            throw err;
        }
    };
};
