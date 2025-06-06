import minion from "magda-minion-framework/src/index.js";
import { config } from "./config.js";
import { Chunker } from "./chunker.js";
import { FixedLengthChunkStrategy } from "./chunker.js";
import { onRecordFoundRegistryRecord } from "./onRecordFoundRegistryRecord.js";
import { onRecordFoundStorageObject } from "./onRecordFoundStorageObject.js";
import { createSemanticIndexerMapping } from "./indexSchema.js";
import EmbeddingApiClient from "magda-typescript-common/src/EmbeddingApiClient.js";
import OpensearchApiClient from "magda-typescript-common/src/OpensearchApiClient.js";
import SemanticIndexerOptions from "./semanticIndexerOptions.js";
import MinionOptions, {
    onRecordFoundType
} from "magda-minion-framework/src/MinionOptions.js";
import retry from "magda-typescript-common/src/retry.js";
import { validateSemanticIndexerOptions } from "./semanticIndexerOptions.js";

export default async function semanticIndexer(
    userConfig: SemanticIndexerOptions
) {
    try {
        validateSemanticIndexerOptions(userConfig);
        const opensearchApiClient = await retry(
            () =>
                OpensearchApiClient.getOpensearchApiClient({
                    url: userConfig.argv.elasticSearchUrl
                }),
            5,
            5,
            (e, left) =>
                console.error(
                    `Opensearch connection failed, remaining retries: ${left}, error:`,
                    e.message
                )
        );

        const embeddingApiClient = await retry(
            () =>
                Promise.resolve(
                    new EmbeddingApiClient({
                        baseApiUrl: userConfig.argv.embeddingApiUrl
                    })
                ),
            5,
            5,
            (e, left) =>
                console.error(
                    `Embedding API connection failed, remaining retries: ${left}, error:`,
                    e.message
                )
        );

        const indexDefinition = createSemanticIndexerMapping();
        if (
            !(await opensearchApiClient.indexExists(
                config.elasticSearch.indices.semanticIndex.indexName
            ))
        ) {
            await opensearchApiClient.createIndex(indexDefinition);
        }

        const chunker = new Chunker(
            new FixedLengthChunkStrategy(
                userConfig.chunkSize || config.default.chunkSize,
                userConfig.overlap || config.default.overlap
            )
        );

        let onRecordFound: onRecordFoundType;
        let minionOptions: MinionOptions;

        if (userConfig.itemType === "registryRecord") {
            onRecordFound = onRecordFoundRegistryRecord(
                userConfig as any,
                chunker,
                embeddingApiClient,
                opensearchApiClient
            );
            minionOptions = {
                argv: userConfig.argv,
                id: userConfig.id,
                aspects: userConfig.aspects || [],
                optionalAspects: userConfig.optionalAspects || [],
                writeAspectDefs: [],
                async: true,
                dereference: true,
                includeEvents: false,
                includeRecords: true,
                onRecordFound: onRecordFound
            };
        } else if (userConfig.itemType === "storageObject") {
            onRecordFound = onRecordFoundStorageObject(
                userConfig as any,
                chunker,
                embeddingApiClient,
                opensearchApiClient
            );
            minionOptions = {
                argv: userConfig.argv,
                id: userConfig.id,
                aspects: ["dataset-distributions"],
                optionalAspects: [],
                writeAspectDefs: [],
                async: true,
                dereference: true,
                includeEvents: false,
                onRecordFound: onRecordFound
            };
        } else {
            throw new Error("Invalid itemType");
        }

        minion(minionOptions).catch((e: Error) => {
            console.error("Minion execution error: " + e.message, e);
            process.exit(1);
        });
    } catch (e) {
        console.error(
            "semanticIndexer initialization error: " + (e as Error).message,
            e
        );
        process.exit(1);
    }
}
