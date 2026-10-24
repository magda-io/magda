import { expect } from "chai";
import ServerError from "magda-typescript-common/src/ServerError.js";
import {
    AspectDefItem,
    AspectDefinitionRegistry,
    migrateAspectDefinitions
} from "../migrateAspectDefinitions.js";

const OLD_ACCESS_GROUP_DETAILS: AspectDefItem = {
    id: "access-group-details",
    name: "Access Group Details",
    jsonSchema: {
        type: "object",
        properties: { resourceUri: { enum: ["object/record"] } }
    }
};

const NEW_ACCESS_GROUP_DETAILS: AspectDefItem = {
    id: "access-group-details",
    name: "access-group-details",
    jsonSchema: {
        type: "object",
        properties: {
            resourceUri: {
                enum: [
                    "object/record",
                    "object/agentSkill/user",
                    "object/agentSkill/system"
                ]
            }
        }
    }
};

const DCAT: AspectDefItem = {
    id: "dcat-dataset-strings",
    name: "DCAT Dataset properties as strings",
    jsonSchema: { type: "object", properties: { title: { type: "string" } } }
};

class FakeRegistry implements AspectDefinitionRegistry {
    readonly stored = new Map<string, AspectDefItem>();
    readonly gets: string[] = [];
    readonly puts: AspectDefItem[] = [];
    getError: (id: string) => unknown = () => undefined;
    putError: (def: AspectDefItem) => Error | undefined = () => undefined;

    constructor(defs: AspectDefItem[] = []) {
        defs.forEach((def) => this.stored.set(def.id, structuredClone(def)));
    }

    async getAspectDefinition(id: string) {
        this.gets.push(id);
        const error = this.getError(id);
        if (error) throw error;
        const def = this.stored.get(id);
        if (!def) throw new ServerError("Failed to getAspectDefinition", 404);
        return structuredClone(def);
    }

    async putAspectDefinition(def: AspectDefItem) {
        this.puts.push(structuredClone(def));
        const error = this.putError(def);
        if (error) return error;
        this.stored.set(def.id, structuredClone(def));
        return def;
    }
}

const silent = { log: (): void => undefined };

describe("migrateAspectDefinitions", () => {
    it("creates missing definitions", async () => {
        const registry = new FakeRegistry([OLD_ACCESS_GROUP_DETAILS]);
        await migrateAspectDefinitions(registry, [DCAT], { logger: silent });
        expect(registry.puts).to.deep.equal([DCAT]);
    });

    it("replaces an outdated release-owned definition and keeps its name", async () => {
        const registry = new FakeRegistry([OLD_ACCESS_GROUP_DETAILS, DCAT]);
        await migrateAspectDefinitions(
            registry,
            [NEW_ACCESS_GROUP_DETAILS, DCAT],
            { logger: silent }
        );
        expect(registry.puts).to.deep.equal([
            {
                ...NEW_ACCESS_GROUP_DETAILS,
                name: OLD_ACCESS_GROUP_DETAILS.name
            }
        ]);
    });

    it("makes no writes when run again against the upgraded schema", async () => {
        const registry = new FakeRegistry([OLD_ACCESS_GROUP_DETAILS, DCAT]);
        const defs = [NEW_ACCESS_GROUP_DETAILS, DCAT];
        await migrateAspectDefinitions(registry, defs, { logger: silent });
        registry.puts.length = 0;
        await migrateAspectDefinitions(registry, defs, { logger: silent });
        expect(registry.puts).to.deep.equal([]);
    });

    it("treats a stored schema with reordered keys as up to date", async () => {
        const reordered = {
            ...NEW_ACCESS_GROUP_DETAILS,
            jsonSchema: {
                properties: NEW_ACCESS_GROUP_DETAILS.jsonSchema.properties,
                type: "object"
            }
        };
        const registry = new FakeRegistry([reordered]);
        await migrateAspectDefinitions(registry, [NEW_ACCESS_GROUP_DETAILS], {
            logger: silent
        });
        expect(registry.puts).to.deep.equal([]);
    });

    it("never overwrites a definition that is not release-owned", async () => {
        const customised = {
            ...DCAT,
            jsonSchema: { type: "object", additionalProperties: true }
        };
        const registry = new FakeRegistry([customised]);
        await migrateAspectDefinitions(registry, [DCAT], { logger: silent });
        expect(registry.puts).to.deep.equal([]);
    });

    it("rejects and stops when a lookup fails with a Registry error", async () => {
        const registry = new FakeRegistry([OLD_ACCESS_GROUP_DETAILS]);
        registry.getError = (id) =>
            id === DCAT.id
                ? new ServerError("Failed to getAspectDefinition", 500)
                : undefined;
        let error: Error | undefined;
        await migrateAspectDefinitions(
            registry,
            [DCAT, NEW_ACCESS_GROUP_DETAILS],
            { logger: silent }
        ).catch((e) => (error = e));
        expect(error?.message).to.contain(
            "Failed to look up aspect definition 'dcat-dataset-strings'"
        );
        // Neither treated as missing nor followed by the remaining definitions.
        expect(registry.puts).to.deep.equal([]);
        expect(registry.gets).to.deep.equal([DCAT.id]);
    });

    it("rejects when a lookup fails without a status (connection error)", async () => {
        const registry = new FakeRegistry();
        registry.getError = () => new TypeError("fetch failed");
        let error: Error | undefined;
        await migrateAspectDefinitions(registry, [DCAT], {
            logger: silent
        }).catch((e) => (error = e));
        expect(error?.message).to.contain("fetch failed");
        expect(registry.puts).to.deep.equal([]);
    });

    it("rejects when creating a missing definition fails", async () => {
        const registry = new FakeRegistry();
        registry.putError = () =>
            new ServerError("Failed to putAspectDefinition", 500);
        let error: Error | undefined;
        await migrateAspectDefinitions(
            registry,
            [DCAT, NEW_ACCESS_GROUP_DETAILS],
            { logger: silent }
        ).catch((e) => (error = e));
        expect(error?.message).to.contain(
            "Failed to create aspect definition 'dcat-dataset-strings'"
        );
        expect(registry.puts.map((def) => def.id)).to.deep.equal([DCAT.id]);
    });

    it("rejects when updating a release-owned definition fails", async () => {
        const registry = new FakeRegistry([OLD_ACCESS_GROUP_DETAILS]);
        registry.putError = () =>
            new ServerError("Failed to putAspectDefinition", 400);
        let error: Error | undefined;
        await migrateAspectDefinitions(registry, [NEW_ACCESS_GROUP_DETAILS], {
            logger: silent
        }).catch((e) => (error = e));
        expect(error?.message).to.contain(
            "Failed to update aspect definition 'access-group-details'"
        );
        expect(registry.stored.get("access-group-details")).to.deep.equal(
            OLD_ACCESS_GROUP_DETAILS
        );
    });

    it("rejects when there is nothing to migrate", async () => {
        let error: Error | undefined;
        await migrateAspectDefinitions(new FakeRegistry(), [], {
            logger: silent
        }).catch((e) => (error = e));
        expect(error?.message).to.contain(
            "Cannot locate built-in registry aspect definition files"
        );
    });
});
