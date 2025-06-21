import SemanticIndexerOptions from "../semanticIndexerOptions.js";
import { ItemType } from "../indexSchema.js";
import { CreateEmbeddingText } from "../createEmbeddingText.js";
import { Record } from "@magda/typescript-common/dist/generated/registry/api.js";
import { expect } from "chai";
import { SemanticIndexerArguments } from "../commonYargs.js";

export function createFakeSemanticIndexerConfig(
    overrideConfig: Partial<SemanticIndexerOptions> = {}
): SemanticIndexerOptions {
    const originalEnv = process.env;
    process.env = {
        ...originalEnv,
        JWT_SECRET: "test-secret",
        USER_ID: "test-user"
    };

    const commonArgs: SemanticIndexerArguments = {
        listenPort: 6100,
        internalUrl: "http://localhost:6100",
        jwtSecret: "test-secret",
        userId: "test-user",
        registryUrl: "http://localhost:6101",
        minioConfig: {
            endPoint: "localhost",
            port: 9000,
            useSSL: false,
            region: "us-east-1",
            defaultDatasetBucket: "test-bucket"
        },
        minioAccessKey: "minioadmin",
        minioSecretKey: "minioadmin",
        enableMultiTenant: false,
        tenantUrl: "http://localhost:6101",
        retries: 3,
        semanticIndexerConfig: {
            numberOfShards: 1,
            numberOfReplicas: 0,
            indexName: "semantic-index",
            indexVersion: 1,
            chunkSizeLimit: 512,
            overlap: 64,
            bulkEmbeddingsSize: 1,
            bulkIndexSize: 50,
            fullIndexName: "semantic-index-v1",
            knnVectorFieldConfig: {
                mode: "in_memory",
                dimension: 768,
                spaceType: "l2",
                efConstruction: 100,
                efSearch: 100,
                m: 16,
                encoder: {
                    name: "sq",
                    type: "fp16",
                    clip: false
                }
            }
        },
        opensearchApiURL: "http://localhost:9200",
        embeddingApiURL: "http://localhost:3000"
    };

    const defaultConfig: SemanticIndexerOptions = {
        argv: commonArgs,
        id: "test-minion",
        itemType: (overrideConfig.itemType ?? "registryRecord") as ItemType,
        aspects: ["test-aspect"],
        optionalAspects: [],
        formatTypes: ["txt"],
        createEmbeddingText: (overrideConfig.createEmbeddingText ??
            ((input: any) =>
                Promise.resolve({
                    text: "This is a test text"
                }))) as CreateEmbeddingText,
        chunkSizeLimit: 100,
        overlap: 0,
        autoDownloadFile: false
    };
    return { ...defaultConfig, ...overrideConfig };
}

export function createRecord(partial: Partial<Record>): Record {
    return {
        id: partial.id || "id",
        name: partial.name || "name",
        aspects: partial.aspects || {},
        sourceTag: partial.sourceTag || "source",
        tenantId: partial.tenantId || 0,
        ...partial
    };
}

export const expectThrowsAsync = async (
    method: () => Promise<void>,
    errorMessage?: string
) => {
    let error = null;
    try {
        await method();
    } catch (err) {
        error = err;
    }
    expect(error).to.be.an("Error");
    if (errorMessage) {
        expect((error as Error).message).to.equal(errorMessage);
    }
};

export const expectNoThrowsAsync = async (method: () => Promise<void>) => {
    let error = null;
    try {
        await method();
    } catch (err) {
        error = err;
    }
    expect(error).to.be.null;
};
