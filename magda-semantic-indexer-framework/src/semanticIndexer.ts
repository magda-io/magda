import minion from "magda-minion-framework/src/index.js";
import {
    Chunker,
    UserDefinedChunkStrategy,
    RecursiveChunkStrategy
} from "./chunker.js";
import { onRecordFoundRegistryRecord } from "./onRecordFoundRegistryRecord.js";
import { onRecordFoundStorageObject } from "./onRecordFoundStorageObject.js";
import { createSemanticIndexerMapping } from "./indexSchema.js";
import EmbeddingApiClient from "magda-typescript-common/src/EmbeddingApiClient.js";
import OpensearchApiClient from "magda-typescript-common/src/OpensearchApiClient.js";
import SemanticIndexerOptions, {
    validateSemanticIndexerOptions
} from "./semanticIndexerOptions.js";
import MinionOptions, {
    onRecordFoundType
} from "magda-minion-framework/src/MinionOptions.js";
import retry from "magda-typescript-common/src/retry.js";
import { MinioClient } from "./MinioClient.js";
import { MAGDA_SYSTEM_ID } from "magda-typescript-common/src/registry/TenantConsts.js";
import Registry from "magda-typescript-common/src/registry/AuthorizedRegistryClient.js";

// Main function for semantic indexer
export default async function semanticIndexer(
    userConfig: SemanticIndexerOptions
) {
    try {
        validateSemanticIndexerOptions(userConfig);
        const semanticIndexerConfig = userConfig.argv.semanticIndexerConfig;
        const opensearchApiClient = await retry(
            () =>
                OpensearchApiClient.getOpensearchApiClient({
                    url: userConfig.argv.opensearchApiURL
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
                        baseApiUrl: userConfig.argv.embeddingApiURL
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

        const registryReadonlyClient = new Registry({
            baseUrl: userConfig.argv.registryReadonlyURL,
            jwtSecret: userConfig.argv.jwtSecret,
            userId: userConfig.argv.userId,
            maxRetries: 3,
            tenantId: MAGDA_SYSTEM_ID
        });

        if (
            !(await opensearchApiClient.indexExists(
                semanticIndexerConfig.fullIndexName
            ))
        ) {
            const indexDefinition = createSemanticIndexerMapping(userConfig);
            await opensearchApiClient.createIndex(indexDefinition);
        }

        const chunkStrategy = userConfig.chunkStrategy
            ? new UserDefinedChunkStrategy(userConfig.chunkStrategy)
            : new RecursiveChunkStrategy(
                  semanticIndexerConfig.chunkSizeLimit ||
                      userConfig.chunkSizeLimit,
                  semanticIndexerConfig.overlap || userConfig.overlap
              );

        const chunker = new Chunker(chunkStrategy);

        let onRecordFound: onRecordFoundType;
        let minionOptions: MinionOptions;

        if (userConfig.itemType === "registryRecord") {
            onRecordFound = onRecordFoundRegistryRecord(
                userConfig,
                chunker,
                embeddingApiClient,
                opensearchApiClient,
                registryReadonlyClient
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
                includeRecords: false,
                onRecordFound: onRecordFound
            };
        } else if (userConfig.itemType === "storageObject") {
            const minioClient = new MinioClient(
                userConfig.argv.minioConfig,
                userConfig.argv.minioAccessKey,
                userConfig.argv.minioSecretKey
            );
            onRecordFound = onRecordFoundStorageObject(
                userConfig,
                chunker,
                embeddingApiClient,
                opensearchApiClient,
                minioClient,
                registryReadonlyClient
            );
            minionOptions = {
                argv: userConfig.argv,
                id: userConfig.id,
                aspects: ["dcat-distribution-strings", "dataset-format"],
                optionalAspects: [],
                writeAspectDefs: [],
                async: true,
                dereference: false,
                includeEvents: false,
                includeRecords: true,
                onRecordFound: onRecordFound,
                maxRetries: 3
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
