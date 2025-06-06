import SemanticIndexerOptions from "../semanticIndexerOptions.js";
import { ItemType } from "../indexSchema.js";
import { CreateEmbeddingText } from "../createEmbeddingText.js";
import { Record } from "@magda/typescript-common/dist/generated/registry/api.js";
import { expect } from "chai";
import { SemanticIndexerArguments } from "../commonSemanticIndexerYargs.js";

export function createFakeSemanticIndexerConfig<T extends ItemType>(
    overrideConfig: Partial<SemanticIndexerOptions> = {}
): SemanticIndexerOptions {
    const defaultConfig: SemanticIndexerOptions = {
        argv: {
            internalUrl: "http://localhost:6100",
            registryUrl: "http://localhost:6101",
            enableMultiTenant: false,
            tenantUrl: "",
            jwtSecret: "test-secret",
            userId: "test-user",
            listenPort: 6100,
            embeddingApiUrl: "http://localhost:3000",
            elasticSearchUrl: "http://localhost:9200"
        } as SemanticIndexerArguments,
        id: "test-minion",
        itemType: (overrideConfig.itemType ?? "registryRecord") as T,
        aspects: ["test-aspect"],
        optionalAspects: [],
        formatTypes: ["txt"],
        createEmbeddingText: (overrideConfig.createEmbeddingText ??
            ((input: any) =>
                Promise.resolve({
                    text: "This is a test text"
                }))) as CreateEmbeddingText,
        chunkSize: 100,
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
