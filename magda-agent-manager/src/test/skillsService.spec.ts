import { expect } from "chai";
import { ZipFile } from "yazl";
import { DownstreamServiceError } from "../skills/clients.js";
import {
    agentSkillRecordId,
    AgentSkillError,
    AgentSkillService
} from "../skills/service.js";
import {
    AgentSkillAuthorization,
    AgentSkillRecord,
    AgentSkillRegistry,
    AgentSkillStorage,
    DownloadedArchive,
    RegistryListOptions,
    RegistryRecordsPage
} from "../skills/types.js";
import { AuthenticatedUser } from "../types.js";

const owner: AuthenticatedUser = {
    id: "00000000-0000-4000-8000-000000000123",
    sessionToken: "owner-token"
};
const admin: AuthenticatedUser = {
    id: "00000000-0000-4000-8000-000000000999",
    sessionToken: "admin-token"
};
const otherOwner: AuthenticatedUser = {
    id: "00000000-0000-4000-8000-000000000456",
    sessionToken: "other-owner-token"
};
const otherAdmin: AuthenticatedUser = {
    id: "00000000-0000-4000-8000-000000000888",
    sessionToken: "other-admin-token"
};
const recordId = `agent-skill-${owner.id}-useful-skill`;

async function skillZip(
    name = "useful-skill",
    description = "A useful skill",
    extra: Array<{ name: string; content: string }> = []
): Promise<Buffer> {
    const zip = new ZipFile();
    zip.addBuffer(
        Buffer.from(
            `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nInstructions.\n`
        ),
        "SKILL.md"
    );
    for (const entry of extra) {
        zip.addBuffer(Buffer.from(entry.content), entry.name);
    }
    zip.end();
    const chunks: Buffer[] = [];
    for await (const chunk of zip.outputStream) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

class MemoryRegistry implements AgentSkillRegistry {
    records = new Map<string, AgentSkillRecord>();
    occupiedIds = new Set<string>();
    getCalls = 0;
    writes: AgentSkillRecord[] = [];
    failCreateAfterWrite = false;
    failCreateError?: Error;
    failPutState?: "PENDING" | "READY" | "DELETING";

    async get(id: string): Promise<unknown | undefined> {
        this.getCalls += 1;
        const record = this.records.get(id);
        return record ? structuredClone(record) : undefined;
    }

    async list(options: RegistryListOptions): Promise<RegistryRecordsPage> {
        const records = [...this.records.values()].filter((record) => {
            const aspect = record.aspects["agent-skill"];
            return (
                (!options.scope || aspect.scope === options.scope) &&
                (!options.state || aspect.state === options.state) &&
                (!options.q || record.name.includes(options.q))
            );
        });
        return {
            hasMore: false,
            records: records.map((record) => structuredClone(record))
        };
    }

    async create(record: AgentSkillRecord): Promise<unknown> {
        if (this.failCreateError) {
            throw this.failCreateError;
        }
        if (this.records.has(record.id) || this.occupiedIds.has(record.id)) {
            throw new DownstreamServiceError(
                "registry",
                400,
                "Registry API rejected record creation"
            );
        }
        this.records.set(record.id, structuredClone(record));
        this.writes.push(structuredClone(record));
        if (this.failCreateAfterWrite) {
            this.failCreateAfterWrite = false;
            throw new Error("response lost");
        }
        return record;
    }

    async put(record: AgentSkillRecord): Promise<unknown> {
        this.records.set(record.id, structuredClone(record));
        this.writes.push(structuredClone(record));
        if (record.aspects["agent-skill"].state === this.failPutState) {
            this.failPutState = undefined;
            throw new Error("put failed");
        }
        return record;
    }

    async delete(id: string): Promise<void> {
        this.records.delete(id);
    }
}

class MemoryStorage implements AgentSkillStorage {
    archives = new Map<string, Buffer>();
    uploads: Array<{ key: string; recordId: string; token: string }> = [];
    downloads = 0;
    failUpload = false;
    failDelete = false;

    async exists(key: string): Promise<boolean> {
        return this.archives.has(key);
    }

    async download(key: string): Promise<DownloadedArchive> {
        this.downloads += 1;
        const bytes = this.archives.get(key);
        if (!bytes) throw new Error("missing");
        return { bytes: Buffer.from(bytes), contentType: "application/zip" };
    }

    async upload(
        key: string,
        recordIdValue: string,
        bytes: Buffer,
        token: string
    ): Promise<void> {
        this.uploads.push({ key, recordId: recordIdValue, token });
        if (this.failUpload) {
            this.failUpload = false;
            throw new Error("upload failed");
        }
        this.archives.set(key, Buffer.from(bytes));
    }

    async delete(key: string): Promise<void> {
        if (this.failDelete) {
            this.failDelete = false;
            throw new Error("delete failed");
        }
        this.archives.delete(key);
    }
}

class TestAuthorization implements AgentSkillAuthorization {
    calls: Array<{
        operation: string;
        record: AgentSkillRecord;
        token: string;
    }> = [];
    decide: (
        operation: "create" | "read" | "update" | "delete",
        record: AgentSkillRecord
    ) => boolean = () => true;

    async can(
        operation: "create" | "read" | "update" | "delete",
        record: AgentSkillRecord,
        token: string
    ): Promise<boolean> {
        this.calls.push({ operation, record: structuredClone(record), token });
        return this.decide(operation, record);
    }
}

function fixture(shared?: {
    registry?: MemoryRegistry;
    storage?: MemoryStorage;
    authorization?: TestAuthorization;
}) {
    const registry = shared?.registry || new MemoryRegistry();
    const storage = shared?.storage || new MemoryStorage();
    const authorization = shared?.authorization || new TestAuthorization();
    let tick = 0;
    const service = new AgentSkillService({
        registry,
        storage,
        authorization,
        tenantId: 0,
        now: () => new Date(Date.UTC(2026, 9, 13, 12, 0, tick++)),
        archiveLimits: {
            maxCompressedBytes: 1024 * 1024,
            maxUncompressedBytes: 2 * 1024 * 1024,
            maxEntries: 16,
            maxPathLength: 120,
            maxNestingDepth: 5,
            maxSkillMarkdownBytes: 64 * 1024
        }
    });
    return { service, registry, storage, authorization };
}

describe("Agent Skill publication state machine", () => {
    let originalInfo: typeof console.info;
    beforeEach(() => {
        originalInfo = console.info;
        console.info = () => undefined;
    });
    afterEach(() => {
        console.info = originalInfo;
    });

    it("derives canonical deterministic user and system record IDs", () => {
        const maxName = "a".repeat(46);
        const userId = agentSkillRecordId("user", owner.id, maxName);
        expect(userId).to.equal(`agent-skill-${owner.id}-${maxName}`);
        expect(userId).to.have.length(95);
        expect(
            agentSkillRecordId(
                "system",
                "00000000-0000-0000-0000-000000000000",
                "system-csv-analyser"
            )
        ).to.equal("agent-skill-system-csv-analyser");
        for (const [scope, ownerId, name] of [
            ["user", owner.id, "a".repeat(47)],
            ["user", owner.id, "system-private"],
            ["system", owner.id, "missing-prefix"],
            ["user", owner.id, "capture-workflow"],
            ["user", owner.id, "magda-mgd"],
            ["user", "ABCDEF00-0000-4000-8000-000000000123", "valid-name"]
        ] as const) {
            expect(() => agentSkillRecordId(scope, ownerId, name)).to.throw(
                AgentSkillError
            );
        }
    });

    it("authorizes before publication and transitions PENDING to READY", async () => {
        const { service, registry, storage, authorization } = fixture();
        await service.prepareCreate("user", owner);
        expect(authorization.calls[0].operation).to.equal("create");
        expect(
            authorization.calls[0].record.aspects["access-control"].ownerId
        ).to.equal(owner.id);

        const result = await service.createAuthorized(
            "user",
            await skillZip(),
            owner
        );
        expect(result.id).to.equal(recordId);
        expect(result.name).to.equal("useful-skill");
        expect(
            registry.writes.map((record) => record.aspects["agent-skill"].state)
        ).to.deep.equal(["PENDING", "READY"]);
        expect(storage.uploads).to.deep.equal([
            {
                key: `agent-services/skills/user-skills/${owner.id}/${recordId}.zip`,
                recordId,
                token: owner.sessionToken
            }
        ]);
        expect(registry.records.get(recordId)?.name).to.equal("useful-skill");
    });

    it("uses separate per-owner namespaces for the same user skill name", async () => {
        const registry = new MemoryRegistry();
        const storage = new MemoryStorage();
        const first = fixture({ registry, storage }).service;
        const second = fixture({ registry, storage }).service;
        const bytes = await skillZip();

        await first.prepareCreate("user", owner);
        await second.prepareCreate("user", otherOwner);
        const [firstResult, secondResult] = await Promise.all([
            first.createAuthorized("user", bytes, owner),
            second.createAuthorized("user", bytes, otherOwner)
        ]);
        expect(firstResult.id).to.equal(`agent-skill-${owner.id}-useful-skill`);
        expect(secondResult.id).to.equal(
            `agent-skill-${otherOwner.id}-useful-skill`
        );
        expect(registry.records.size).to.equal(2);
    });

    it("enforces duplicate names atomically across service instances", async () => {
        const registry = new MemoryRegistry();
        const storage = new MemoryStorage();
        const first = fixture({ registry, storage }).service;
        const second = fixture({ registry, storage }).service;
        const sameBytes = await skillZip();

        const sameResults = await Promise.all([
            first.createAuthorized("user", sameBytes, owner),
            second.createAuthorized("user", sameBytes, owner)
        ]);
        expect(sameResults.map((result) => result.id)).to.deep.equal([
            recordId,
            recordId
        ]);
        expect(registry.records.size).to.equal(1);

        const differentName = "different-content";
        const differentId = agentSkillRecordId("user", owner.id, differentName);
        const third = fixture({ registry, storage }).service;
        const fourth = fixture({ registry, storage }).service;
        const results = await Promise.allSettled([
            third.createAuthorized(
                "user",
                await skillZip(differentName, "First"),
                owner
            ),
            fourth.createAuthorized(
                "user",
                await skillZip(differentName, "Second"),
                owner
            )
        ]);
        expect(
            results.filter((result) => result.status === "fulfilled")
        ).to.have.length(1);
        const rejected = results.find(
            (result): result is PromiseRejectedResult =>
                result.status === "rejected"
        );
        expect((rejected?.reason as AgentSkillError).code).to.equal(
            "AGENT_SKILL_ID_CONFLICT"
        );
        expect(
            registry.records.get(differentId)?.aspects["agent-skill"].state
        ).to.equal("READY");
    });

    it("reports wrong-type deterministic ID occupancy as a non-mutating conflict", async () => {
        const { service, registry, storage } = fixture();
        registry.occupiedIds.add(recordId);
        await service.prepareCreate("user", owner);
        let error: unknown;
        try {
            await service.createAuthorized("user", await skillZip(), owner);
        } catch (caught) {
            error = caught;
        }
        expect((error as AgentSkillError).status).to.equal(409);
        expect((error as AgentSkillError).code).to.equal(
            "AGENT_SKILL_ID_CONFLICT"
        );
        expect(registry.occupiedIds.has(recordId)).to.equal(true);
        expect(registry.records.size).to.equal(0);
        expect(storage.uploads).to.have.length(0);
    });

    it("partitions system names and conflicts across publishing admins", async () => {
        const registry = new MemoryRegistry();
        const storage = new MemoryStorage();
        const first = fixture({ registry, storage }).service;
        const second = fixture({ registry, storage }).service;
        const bytes = await skillZip("system-reporting", "System reporting");
        await first.prepareCreate("system", admin);
        const created = await first.createAuthorized("system", bytes, admin);
        expect(created.id).to.equal("agent-skill-system-reporting");

        await second.prepareCreate("system", otherAdmin);
        let error: unknown;
        try {
            await second.createAuthorized("system", bytes, otherAdmin);
        } catch (caught) {
            error = caught;
        }
        expect((error as AgentSkillError).code).to.equal(
            "AGENT_SKILL_ID_CONFLICT"
        );
        expect(registry.records.size).to.equal(1);
    });

    it("rejects arbitrary and invalid deterministic IDs before Registry reads", async () => {
        const { service, registry } = fixture();
        for (const id of [
            "10000000-0000-4000-8000-000000000001",
            `agent-skill-${owner.id}-${"a".repeat(47)}`,
            `agent-skill-${owner.id}-system-private`
        ]) {
            let error: unknown;
            try {
                await service.prepareExisting("user", id, "read", owner);
            } catch (caught) {
                error = caught;
            }
            expect((error as AgentSkillError).status).to.equal(404);
        }
        expect(registry.getCalls).to.equal(0);
    });

    it("does not turn a definite Registry authorization failure into recovery", async () => {
        const { service, registry, storage } = fixture();
        registry.failCreateError = new DownstreamServiceError(
            "registry",
            403,
            "Registry API rejected record creation"
        );
        let error: unknown;
        try {
            await service.createAuthorized("user", await skillZip(), owner);
        } catch (caught) {
            error = caught;
        }
        expect((error as AgentSkillError).status).to.equal(403);
        expect(registry.getCalls).to.equal(1);
        expect(registry.records.size).to.equal(0);
        expect(storage.uploads).to.have.length(0);
    });

    it("leaves failed creates PENDING and resumes deterministically", async () => {
        const { service, registry, storage } = fixture();
        const bytes = await skillZip();
        await service.prepareCreate("user", owner);
        storage.failUpload = true;
        let firstError: unknown;
        try {
            await service.createAuthorized("user", bytes, owner);
        } catch (error) {
            firstError = error;
        }
        expect(firstError).to.be.instanceOf(AgentSkillError);
        expect((firstError as AgentSkillError).recordId).to.equal(recordId);
        expect(
            registry.records.get(recordId)?.aspects["agent-skill"].state
        ).to.equal("PENDING");

        const result = await service.createAuthorized("user", bytes, owner);
        expect(result.id).to.equal(recordId);
        expect(
            registry.records.get(recordId)?.aspects["agent-skill"].state
        ).to.equal("READY");
        expect(storage.uploads).to.have.length(2);
    });

    it("recovers when Registry creates the record but its response is lost", async () => {
        const { service, registry } = fixture();
        registry.failCreateAfterWrite = true;
        await service.prepareCreate("user", owner);
        const result = await service.createAuthorized(
            "user",
            await skillZip(),
            owner
        );
        expect(result.id).to.equal(recordId);
        expect(
            registry.records.get(recordId)?.aspects["agent-skill"].state
        ).to.equal("READY");
    });

    it("treats a retried create as success when READY finalization response was lost", async () => {
        const { service, registry, storage } = fixture();
        const bytes = await skillZip();
        registry.failPutState = "READY";
        await service.prepareCreate("user", owner);
        await service
            .createAuthorized("user", bytes, owner)
            .catch(() => undefined);
        expect(
            registry.records.get(recordId)?.aspects["agent-skill"].state
        ).to.equal("READY");
        const ready = structuredClone(registry.records.get(recordId)!);

        await service.prepareCreate("user", owner);
        const result = await service.createAuthorized("user", bytes, owner);
        expect(result.id).to.equal(recordId);
        expect(storage.uploads).to.have.length(1);
        expect(registry.records.get(recordId)).to.deep.equal(ready);
    });

    it("repairs a failed replacement only with the same pending archive", async () => {
        const { service, registry, storage } = fixture();
        await service.prepareCreate("user", owner);
        await service.createAuthorized("user", await skillZip(), owner);
        const replacement = await skillZip("useful-skill", "Replacement");
        let current = await service.prepareExisting(
            "user",
            recordId,
            "update",
            owner
        );
        storage.failUpload = true;
        await service
            .replaceAuthorized(current, replacement, owner)
            .catch(() => undefined);
        expect(
            registry.records.get(recordId)?.aspects["agent-skill"].state
        ).to.equal("PENDING");

        current = await service.prepareExisting(
            "user",
            recordId,
            "update",
            owner
        );
        let conflict: unknown;
        try {
            await service.replaceAuthorized(
                current,
                await skillZip("useful-skill", "Different"),
                owner
            );
        } catch (error) {
            conflict = error;
        }
        expect((conflict as AgentSkillError).code).to.equal(
            "AGENT_SKILL_PENDING_CONFLICT"
        );

        const repaired = await service.replaceAuthorized(
            current,
            replacement,
            owner
        );
        expect(repaired.name).to.equal("useful-skill");
        expect(
            registry.records.get(recordId)?.aspects["agent-skill"].state
        ).to.equal("READY");
    });

    it("rejects replacement prepared against a stale record version", async () => {
        const { service, registry, storage } = fixture();
        await service.prepareCreate("user", owner);
        await service.createAuthorized("user", await skillZip(), owner);
        const prepared = await service.prepareExisting(
            "user",
            recordId,
            "update",
            owner
        );
        const current = registry.records.get(recordId)!;
        registry.records.set(recordId, {
            ...current,
            aspects: {
                ...current.aspects,
                "agent-skill": {
                    ...current.aspects["agent-skill"],
                    updatedAt: "2026-10-13T13:00:00.000Z"
                }
            }
        });
        let error: unknown;
        try {
            await service.replaceAuthorized(
                prepared,
                await skillZip("new-skill", "New"),
                owner
            );
        } catch (caught) {
            error = caught;
        }
        expect((error as AgentSkillError).code).to.equal(
            "AGENT_SKILL_VERSION_CONFLICT"
        );
        expect(storage.uploads).to.have.length(1);
    });

    it("rejects replacement renames before Registry or Storage mutation", async () => {
        const { service, registry, storage } = fixture();
        await service.prepareCreate("user", owner);
        await service.createAuthorized("user", await skillZip(), owner);
        const current = await service.prepareExisting(
            "user",
            recordId,
            "update",
            owner
        );
        const ready = structuredClone(registry.records.get(recordId)!);
        const writes = registry.writes.length;
        const uploads = storage.uploads.length;
        let error: unknown;
        try {
            await service.replaceAuthorized(
                current,
                await skillZip("renamed-skill", "Renamed"),
                owner
            );
        } catch (caught) {
            error = caught;
        }
        expect((error as AgentSkillError).status).to.equal(409);
        expect((error as AgentSkillError).code).to.equal(
            "AGENT_SKILL_NAME_IMMUTABLE"
        );
        expect(registry.writes).to.have.length(writes);
        expect(storage.uploads).to.have.length(uploads);
        expect(registry.records.get(recordId)).to.deep.equal(ready);
    });

    it("preserves immutable ownership while recording the replacing publisher", async () => {
        const { service, registry, storage } = fixture();
        await service.prepareCreate("user", owner);
        await service.createAuthorized("user", await skillZip(), owner);
        const current = await service.prepareExisting(
            "user",
            recordId,
            "update",
            admin
        );
        const result = await service.replaceAuthorized(
            current,
            await skillZip("useful-skill", "Updated"),
            admin
        );
        expect(result.ownerId).to.equal(owner.id);
        expect(result.createdBy).to.equal(owner.id);
        expect(result.updatedBy).to.equal(admin.id);
        expect(storage.uploads[1].key).to.equal(storage.uploads[0].key);
        expect(storage.uploads[1].recordId).to.equal(recordId);
        expect(
            registry.records.get(recordId)?.aspects["access-control"].ownerId
        ).to.equal(owner.id);
    });

    it("fails replacement safely when the original Storage object is missing", async () => {
        const { service, registry, storage } = fixture();
        await service.prepareCreate("user", owner);
        await service.createAuthorized("user", await skillZip(), owner);
        const current = await service.prepareExisting(
            "user",
            recordId,
            "update",
            owner
        );
        storage.archives.clear();
        let error: unknown;
        try {
            await service.replaceAuthorized(current, await skillZip(), owner);
        } catch (caught) {
            error = caught;
        }
        expect((error as AgentSkillError).code).to.equal(
            "AGENT_SKILL_ARCHIVE_MISSING"
        );
        expect(
            registry.records.get(recordId)?.aspects["agent-skill"].state
        ).to.equal("READY");
    });

    it("leaves failed deletes DELETING and completes on retry", async () => {
        const { service, registry, storage } = fixture();
        await service.prepareCreate("user", owner);
        await service.createAuthorized("user", await skillZip(), owner);
        const current = await service.prepareExisting(
            "user",
            recordId,
            "delete",
            owner
        );
        storage.failDelete = true;
        await service.deleteAuthorized(current, owner).catch(() => undefined);
        expect(
            registry.records.get(recordId)?.aspects["agent-skill"].state
        ).to.equal("DELETING");

        const retry = await service.prepareExisting(
            "user",
            recordId,
            "delete",
            owner
        );
        await service.deleteAuthorized(retry, owner);
        expect(registry.records.has(recordId)).to.equal(false);
    });

    it("lists only READY records that pass a per-record decision without loading ZIPs", async () => {
        const { service, registry, storage, authorization } = fixture();
        for (const [id, name, recordOwner, state] of [
            [recordId, "useful-skill", owner.id, "READY"],
            [`agent-skill-${owner.id}-skill-2`, "skill-2", owner.id, "PENDING"],
            [`agent-skill-${admin.id}-skill-3`, "skill-3", admin.id, "READY"]
        ] as const) {
            registry.records.set(id, {
                id,
                name,
                tenantId: 0,
                aspects: {
                    "agent-skill": {
                        scope: "user",
                        createdAt: "2026-10-13T12:00:00.000Z",
                        createdBy: recordOwner,
                        description: "test",
                        archiveKey: `agent-services/skills/user-skills/${recordOwner}/${id}.zip`,
                        updatedAt: "2026-10-13T12:00:00.000Z",
                        updatedBy: recordOwner,
                        checksum: "0".repeat(64),
                        state
                    },
                    "access-control": { ownerId: recordOwner }
                }
            });
        }
        authorization.decide = (_operation, record) =>
            record.name === "authorization-check" ||
            record.aspects["access-control"].ownerId === owner.id;

        const result = await service.list({ scope: "user", limit: 20 }, owner);
        expect(result.records.map((record) => record.id)).to.deep.equal([
            recordId
        ]);
        expect(storage.downloads).to.equal(0);
        expect(
            authorization.calls.filter((call) => call.operation === "read")
        ).to.have.length(3);
    });

    it("does not expose PENDING or DELETING records through metadata reads", async () => {
        const { service, registry } = fixture();
        await service.prepareCreate("user", owner);
        await service.createAuthorized("user", await skillZip(), owner);
        for (const state of ["PENDING", "DELETING"] as const) {
            const current = registry.records.get(recordId)!;
            registry.records.set(recordId, {
                ...current,
                aspects: {
                    ...current.aspects,
                    "agent-skill": {
                        ...current.aspects["agent-skill"],
                        state
                    }
                }
            });
            const prepared = await service.prepareExisting(
                "user",
                recordId,
                "read",
                owner
            );
            let error: unknown;
            try {
                await service.readAuthorized(prepared);
            } catch (caught) {
                error = caught;
            }
            expect((error as AgentSkillError).status).to.equal(404);
        }
    });

    it("fails closed on invalid Registry-backed derived metadata", async () => {
        const { service, registry } = fixture();
        await service.prepareCreate("user", owner);
        await service.createAuthorized("user", await skillZip(), owner);
        const current = registry.records.get(recordId)!;
        registry.records.set(recordId, {
            ...current,
            name: "INVALID SKILL NAME"
        });
        const result = await service.list({ scope: "user", limit: 20 }, owner);
        expect(result.records).to.deep.equal([]);
        let error: unknown;
        try {
            await service.prepareExisting("user", recordId, "read", owner);
        } catch (caught) {
            error = caught;
        }
        expect((error as AgentSkillError).code).to.equal(
            "INVALID_SKILL_RECORD"
        );
    });

    it("rejects a direct-write archive checksum mismatch before download", async () => {
        const { service, storage } = fixture();
        await service.prepareCreate("user", owner);
        await service.createAuthorized("user", await skillZip(), owner);
        const record = await service.prepareExisting(
            "user",
            recordId,
            "read",
            owner
        );
        storage.archives.set(
            record.aspects["agent-skill"].archiveKey,
            await skillZip("tampered-skill")
        );
        let error: unknown;
        try {
            await service.downloadAuthorized(record, owner);
        } catch (caught) {
            error = caught;
        }
        expect((error as AgentSkillError).code).to.equal(
            "INVALID_PUBLISHED_ARCHIVE"
        );
    });

    it("keeps archive content and session credentials out of audit logs", async () => {
        const { service } = fixture();
        const logs: string[] = [];
        console.info = (...values: unknown[]) => logs.push(values.join(" "));
        await service.prepareCreate("user", owner);
        await service.createAuthorized(
            "user",
            await skillZip("useful-skill", "Useful", [
                { name: "secret.md", content: "TOP-SECRET-ARCHIVE-CONTENT" }
            ]),
            owner
        );
        expect(logs).to.have.length(1);
        expect(logs[0]).not.to.include("TOP-SECRET-ARCHIVE-CONTENT");
        expect(logs[0]).not.to.include(owner.sessionToken);
        expect(logs[0]).to.include(recordId);
    });

    it("fails closed when Agent Skill authorization denies a proposed create", async () => {
        const { service, authorization, registry, storage } = fixture();
        authorization.decide = () => false;
        let error: unknown;
        try {
            await service.prepareCreate("user", owner);
        } catch (caught) {
            error = caught;
        }
        expect((error as AgentSkillError).status).to.equal(403);
        expect(registry.records.size).to.equal(0);
        expect(storage.uploads).to.have.length(0);
    });
});
