import { onRecordFoundType } from "magda-minion-framework/src/MinionOptions.js";
import { Chunker } from "./chunker.js";
import EmbeddingApiClient from "magda-typescript-common/src/EmbeddingApiClient.js";
import OpensearchApiClient from "magda-typescript-common/src/OpensearchApiClient.js";
import SemanticIndexerOptions from "./semanticIndexerOptions.js";
import { indexEmbeddingText } from "./indexEmbeddingText.js";
import { Record } from "magda-typescript-common/src/generated/registry/api.js";
import { SkipError } from "./SkipError.js";
import Registry from "magda-typescript-common/src/registry/AuthorizedRegistryClient.js";

// The onRecordFound function passed to minion sdk to handle registry record records
export const onRecordFoundRegistryRecord = (
    options: SemanticIndexerOptions,
    chunker: Chunker,
    embeddingApiClient: EmbeddingApiClient,
    opensearchApiClient: OpensearchApiClient,
    registryReadonlyClient: Registry
): onRecordFoundType => {
    return async (record: Record, _registry) => {
        try {
            if (
                !record.aspects ||
                !options.aspects?.every((aspect) => aspect in record.aspects)
            ) {
                return;
            }

            let embeddingText;
            try {
                embeddingText = await options.createEmbeddingText({
                    record,
                    format: null,
                    filePath: null,
                    url: null,
                    readonlyRegistry: registryReadonlyClient
                });

                if (!embeddingText.text && !embeddingText.subObjects) {
                    throw new SkipError(
                        "User-provided createEmbeddingText function returned no text or subObjects"
                    );
                }
            } catch (err) {
                throw new SkipError(
                    `Error in user-provided createEmbeddingText function: ${
                        (err as Error).message
                    }`
                );
            }

            await indexEmbeddingText({
                options,
                chunker,
                embeddingApiClient,
                opensearchApiClient,
                embeddingText,
                metadata: {
                    recordId: record.id,
                    fileFormat: record.aspects["dataset-format"]?.format
                }
            });
        } catch (err) {
            if (err instanceof SkipError) {
                console.warn(
                    `Skipping record ${record.id} because:`,
                    err.message
                );
                return;
            }
            throw err;
        }
    };
};
