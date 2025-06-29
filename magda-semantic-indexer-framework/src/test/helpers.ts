import { Record } from "@magda/typescript-common/dist/generated/registry/api.js";
import { expect } from "chai";

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
