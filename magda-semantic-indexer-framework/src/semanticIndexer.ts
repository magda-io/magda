import minion from "magda-minion-framework/src/index.js";
import { AsyncLocalStorage } from "async_hooks";
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
import { Record as RegistryRecord } from "magda-typescript-common/src/generated/registry/api.js";

type ProcessingContext = {
    indexerId: string;
    itemType: string;
    recordId: string;
    format?: string;
    downloadUrl?: string;
    startedAt: string;
};

const UNCAUGHT_DIAGNOSTICS_INSTALLED = Symbol.for(
    "magda.semantic.indexer.uncaughtDiagnosticsInstalled"
);
const processingContextStorage = new AsyncLocalStorage<ProcessingContext>();
const inFlightProcessingContexts = new Map<string, ProcessingContext>();

function toErrorPayload(err: unknown) {
    if (err instanceof Error) {
        return {
            name: err.name,
            message: err.message,
            stack: err.stack
        };
    }
    return {
        name: typeof err,
        message: String(err)
    };
}

function installUncaughtDiagnostics() {
    const globalKey = globalThis as Record<PropertyKey, unknown>;
    if (globalKey[UNCAUGHT_DIAGNOSTICS_INSTALLED]) {
        return;
    }

    process.on(
        "uncaughtExceptionMonitor",
        (err: Error, origin: NodeJS.UncaughtExceptionOrigin) => {
            const activeContext = processingContextStorage.getStore() ?? null;
            const inFlight = Array.from(inFlightProcessingContexts.values());
            console.error(
                "[semantic-indexer] uncaught exception monitor",
                JSON.stringify(
                    {
                        origin,
                        error: toErrorPayload(err),
                        activeContext,
                        inFlightContexts: inFlight.slice(0, 10)
                    },
                    null,
                    2
                )
            );
        }
    );

    globalKey[UNCAUGHT_DIAGNOSTICS_INSTALLED] = true;
}

function createProcessingContext(
    userConfig: SemanticIndexerOptions,
    record: RegistryRecord
): ProcessingContext {
    const distributionAspect = record?.aspects?.["dcat-distribution-strings"];
    const format = record?.aspects?.["dataset-format"]?.format;
    return {
        indexerId: userConfig.id,
        itemType: userConfig.itemType,
        recordId: record?.id || "unknown",
        format,
        downloadUrl:
            distributionAspect?.downloadURL || distributionAspect?.accessURL,
        startedAt: new Date().toISOString()
    };
}

function withProcessingDiagnostics(
    userConfig: SemanticIndexerOptions,
    onRecordFound: onRecordFoundType
): onRecordFoundType {
    return async (record: RegistryRecord, registry: Registry) => {
        const context = createProcessingContext(userConfig, record);
        const contextKey = `${context.recordId}-${
            context.startedAt
        }-${Math.random().toString(36).slice(2)}`;
        inFlightProcessingContexts.set(contextKey, context);
        try {
            await processingContextStorage.run(context, () =>
                onRecordFound(record, registry)
            );
        } finally {
            inFlightProcessingContexts.delete(contextKey);
        }
    };
}

// Main function for semantic indexer
export default async function semanticIndexer(
    userConfig: SemanticIndexerOptions
) {
    try {
        installUncaughtDiagnostics();
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
            onRecordFound = withProcessingDiagnostics(
                userConfig,
                onRecordFoundRegistryRecord(
                    userConfig,
                    chunker,
                    embeddingApiClient,
                    opensearchApiClient,
                    registryReadonlyClient
                )
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
            const minioClient = new MinioClient(
                userConfig.argv.minioConfig,
                userConfig.argv.minioAccessKey,
                userConfig.argv.minioSecretKey
            );
            onRecordFound = withProcessingDiagnostics(
                userConfig,
                onRecordFoundStorageObject(
                    userConfig,
                    chunker,
                    embeddingApiClient,
                    opensearchApiClient,
                    minioClient,
                    registryReadonlyClient
                )
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
