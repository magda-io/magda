import SemanticIndexerOptions from "../semanticIndexerOptions.js";
import { ItemType } from "../indexSchema.js";
import { CreateEmbeddingText } from "../createEmbeddingText.js";
import { Record } from "@magda/typescript-common/dist/generated/registry/api.js";
import { expect } from "chai";
import { commonYargs } from "../commonYargs.js";

export function createFakeSemanticIndexerConfig<T extends ItemType>(
    overrideConfig: Partial<SemanticIndexerOptions> = {}
): SemanticIndexerOptions {
    const originalEnv = process.env;
    process.env = {
        ...originalEnv,
        JWT_SECRET: "test-secret",
        USER_ID: "test-user"
    };

    const commonArgs = commonYargs(6100, "http://localhost:6100");
    process.env = originalEnv;
    const defaultConfig: SemanticIndexerOptions = {
        argv: commonArgs,
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
