import SemanticIndexerOptions, {
    validateSemanticIndexerOptions
} from "./semanticIndexerOptions.js";
import MinionOptions, {
    onRecordFoundType
} from "@magda/minion-framework/dist/MinionOptions.js";
import { Chunker, FixedLengthChunkStrategy } from "./chunker.js";
import EmbeddingApiClient from "../EmbeddingApiClient.js";
import minion from "@magda/minion-framework";
import OpensearchApiClient from "../OpensearchApiClient.js";
import { createSemanticIndexerMapping } from "./indexSchema.js";
import { onRecordFoundRegistryRecord } from "./onRecordFoundRegistryRecord.js";
import { onRecordFoundStorageObject } from "./onRecordFoundStorageObject.js";
import retry from "../retry.js";
import { config } from "./config.js";

export async function semanticIndexer(userConfig: SemanticIndexerOptions) {
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
                userConfig.chunkSize,
                userConfig.overlap
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
                aspects: userConfig.aspects,
                optionalAspects: userConfig.optionalAspects,
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
