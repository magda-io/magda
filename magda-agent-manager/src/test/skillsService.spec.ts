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
import jwt from "jsonwebtoken";
import { DEFAULT_ADMIN_USER_ID } from "magda-typescript-common/src/authorization-api/constants.js";
import { noInstallations, noShareGroups } from "./skillSharingWorld.js";

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
const jwtSecret = "agent-skill-test-secret";

function expectInternalSession(token: string): void {
    const payload = jwt.verify(token, jwtSecret, {
        algorithms: ["HS256"]
    }) as { userId: string; iat: number; exp: number };
    expect(payload.userId).to.equal(DEFAULT_ADMIN_USER_ID);
    expect(payload.exp - payload.iat).to.equal(120);
}

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
    listCalls: RegistryListOptions[] = [];
    writes: AgentSkillRecord[] = [];
    calls: Array<{ operation: string; id: string; token: string }> = [];
    failCreateAfterWrite = false;
    failCreateError?: Error;
    failPutState?: "PENDING" | "READY" | "DELETING";

    async get(id: string, token: string): Promise<unknown | undefined> {
        this.getCalls += 1;
        this.calls.push({ operation: "get", id, token });
        const record = this.records.get(id);
        return record ? structuredClone(record) : undefined;
    }

    async list(options: RegistryListOptions): Promise<RegistryRecordsPage> {
        this.listCalls.push(structuredClone(options));
        const records = [...this.records.values()].filter((record) => {
            const aspect = record.aspects["agent-skill"];
            const userMatches =
                !options.userId ||
                (options.userId.operator === "eq"
                    ? aspect.userId === options.userId.value
                    : aspect.userId !== options.userId.value);
            const anyMatches =
                !options.anyOf?.length ||
                options.anyOf.some((condition) => {
                    const actual =
                        condition.field === "type"
                            ? aspect.type
                            : aspect.userId;
                    return condition.operator === "eq"
                        ? actual === condition.value
                        : actual !== condition.value;
                });
            return (
                (!options.type || aspect.type === options.type) &&
                (!options.state || aspect.state === options.state) &&
                userMatches &&
                anyMatches &&
                (!options.q || aspect.name.includes(options.q))
            );
        });
        return {
            hasMore: false,
            records: records.map((record) => structuredClone(record))
        };
    }

    async create(record: AgentSkillRecord, token: string): Promise<unknown> {
        this.calls.push({ operation: "create", id: record.id, token });
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

    async put(record: AgentSkillRecord, token: string): Promise<unknown> {
        this.calls.push({ operation: "put", id: record.id, token });
        this.records.set(record.id, structuredClone(record));
        this.writes.push(structuredClone(record));
        if (record.aspects["agent-skill"].state === this.failPutState) {
            this.failPutState = undefined;
            throw new Error("put failed");
        }
        return record;
    }

    async delete(id: string, token: string): Promise<void> {
        this.calls.push({ operation: "delete", id, token });
        this.records.delete(id);
    }
}

class MemoryStorage implements AgentSkillStorage {
    archives = new Map<string, Buffer>();
    identities = new Map<string, { recordId: string; ownerId: string }>();
    uploads: Array<{ key: string; recordId: string; token: string }> = [];
    inspections: Array<{ key: string; token: string }> = [];
    deletions: Array<{ key: string; token: string }> = [];
    downloads = 0;
    failUpload = false;
    failDelete = false;

    async inspect(key: string, token: string) {
        this.inspections.push({ key, token });
        const identity = this.identities.get(key);
        return identity && this.archives.has(key)
            ? { exists: true, ...identity }
            : { exists: false as const };
    }

    async download(key: string): Promise<DownloadedArchive> {
        this.downloads += 1;
        const bytes = this.archives.get(key);
        if (!bytes) throw new Error("missing");
        return {
            bytes: Buffer.from(bytes),
            contentType: "application/zip",
            ...this.identities.get(key)
        };
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
        if (!this.identities.has(key)) {
            const knownUser = [owner, admin, otherOwner, otherAdmin].find(
                (user) => user.sessionToken === token
            )?.id;
            const decoded = jwt.decode(token) as { userId?: string } | null;
            this.identities.set(key, {
                recordId: recordIdValue,
                ownerId: knownUser || decoded?.userId || "unknown"
            });
        }
        this.archives.set(key, Buffer.from(bytes));
    }

    async delete(key: string, token: string): Promise<void> {
        this.deletions.push({ key, token });
        if (this.failDelete) {
            this.failDelete = false;
            throw new Error("delete failed");
        }
        this.archives.delete(key);
        this.identities.delete(key);
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
        installationRegistry: noInstallations(),
        installationAuthorization: noInstallations(),
        shareGroups: noShareGroups(),
        registry,
        storage,
        authorization,
        tenantId: 0,
        jwtSecret,
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
            agentSkillRecordId("system", undefined, "system-csv-analyser")
        ).to.equal("agent-skill-system-csv-analyser");
        for (const [type, ownerId, name] of [
            ["user", owner.id, "a".repeat(47)],
            ["user", owner.id, "system-private"],
            ["system", owner.id, "missing-prefix"],
            ["user", owner.id, "capture-workflow"],
            ["user", owner.id, "magda-mgd"],
            ["user", "ABCDEF00-0000-4000-8000-000000000123", "valid-name"]
        ] as const) {
            expect(() => agentSkillRecordId(type, ownerId, name)).to.throw(
                AgentSkillError
            );
        }
    });

    it("authorizes before publication and transitions PENDING to READY", async () => {
        const { service, registry, storage, authorization } = fixture();
        await service.prepareCreate("user", owner);
        expect(
            authorization.calls.map((call) => call.operation)
        ).to.deep.equal(["create"]);
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
        expect(result.userId).to.equal(owner.id);
        expect(result.ownerId).to.equal(owner.id);
        expect(result.createdBy).to.equal(owner.id);
        expect(result.updatedBy).to.equal(owner.id);
        expect(
            registry.writes.map((record) => record.aspects["agent-skill"].state)
        ).to.deep.equal(["PENDING", "READY"]);
        expect(
            registry.writes.map((record) => record.aspects["agent-skill"].name)
        ).to.deep.equal(["useful-skill", "useful-skill"]);
        expect(
            registry.writes.every(
                (record) => record.name === record.aspects["agent-skill"].name
            )
        ).to.equal(true);
        expect(storage.uploads).to.deep.equal([
            {
                key: `agent-services/skills/user-skills/${owner.id}/${recordId}.zip`,
                recordId,
                token: owner.sessionToken
            }
        ]);
        expect(registry.records.get(recordId)?.name).to.equal("useful-skill");
    });

    it("completes publication with create permission only", async () => {
        const { service, registry, storage, authorization } = fixture();
        authorization.decide = (operation) => operation === "create";

        await service.prepareCreate("user", owner);
        await service.createAuthorized("user", await skillZip(), owner);

        expect(
            authorization.calls.map((call) => call.operation)
        ).to.deep.equal(["create", "create", "create"]);
        expect(
            authorization.calls.every(
                (call) => call.token === owner.sessionToken
            )
        ).to.equal(true);
        expect(
            registry.records.get(recordId)?.aspects["agent-skill"].state
        ).to.equal("READY");
        expect(storage.uploads[0].token).to.equal(owner.sessionToken);
        const readyPut = registry.calls.find(
            (call) => call.operation === "put"
        );
        expectInternalSession(readyPut!.token);
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
        expect(created.userId).to.equal(undefined);
        expect(
            registry.records.get(created.id)?.aspects["agent-skill"].userId
        ).to.equal(undefined);
        expect(
            registry.records.get(created.id)?.aspects["access-control"]
                .constraintExemption
        ).to.equal(true);

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
        expect(storage.uploads).to.have.length(2);
        expect(storage.uploads[1]).to.deep.include({
            key: storage.uploads[0].key,
            recordId: storage.uploads[0].recordId
        });
        expect(storage.uploads[0].token).to.equal(owner.sessionToken);
        expectInternalSession(storage.uploads[1].token);
        expect(registry.records.get(recordId)).to.deep.equal(ready);
    });

    it("never uses create retry authority on a mislinked existing archive", async () => {
        const { service, storage } = fixture();
        const bytes = await skillZip();
        await service.createAuthorized("user", bytes, owner);
        const key = `agent-services/skills/user-skills/${owner.id}/${recordId}.zip`;
        storage.identities.set(key, {
            recordId: `agent-skill-${otherOwner.id}-useful-skill`,
            ownerId: otherOwner.id
        });
        const uploads = storage.uploads.length;

        let error: unknown;
        try {
            await service.createAuthorized("user", bytes, owner);
        } catch (caught) {
            error = caught;
        }
        expect((error as AgentSkillError).code).to.equal(
            "AGENT_SKILL_ARCHIVE_LINK_INVALID"
        );
        expect(storage.uploads).to.have.length(uploads);
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

    it("preserves system ownership while recording a different trusted publisher", async () => {
        const { service, registry, storage } = fixture();
        const bytes = await skillZip("system-reporting", "System reporting");
        await service.prepareCreate("system", admin);
        const created = await service.createAuthorized("system", bytes, admin);
        const current = await service.prepareExisting(
            "system",
            created.id,
            "update",
            otherAdmin
        );
        const result = await service.replaceAuthorized(
            current,
            await skillZip("system-reporting", "Updated"),
            otherAdmin
        );
        expect(result.ownerId).to.equal(admin.id);
        expect(result.createdBy).to.equal(admin.id);
        expect(result.updatedBy).to.equal(otherAdmin.id);
        expect(storage.uploads[1].key).to.equal(storage.uploads[0].key);
        expect(storage.uploads[1].recordId).to.equal(created.id);
        expect(
            registry.records.get(created.id)?.aspects["access-control"].ownerId
        ).to.equal(admin.id);
    });

    it("completes replacement with update permission only", async () => {
        const { service, registry, storage, authorization } = fixture();
        await service.createAuthorized("user", await skillZip(), owner);
        authorization.calls = [];
        authorization.decide = (operation) => operation === "update";
        registry.calls = [];
        storage.inspections = [];

        const current = await service.prepareExisting(
            "user",
            recordId,
            "update",
            owner
        );
        const result = await service.replaceAuthorized(
            current,
            await skillZip("useful-skill", "Updated"),
            owner
        );

        expect(result.description).to.equal("Updated");
        expect(
            authorization.calls.map((call) => call.operation)
        ).to.deep.equal(["update", "update"]);
        expect(
            authorization.calls.every(
                (call) => call.token === owner.sessionToken
            )
        ).to.equal(true);
        expect(
            registry.calls
                .filter((call) => call.operation === "put")
                .every((call) => call.token === owner.sessionToken)
        ).to.equal(true);
        storage.inspections.forEach((call) =>
            expectInternalSession(call.token)
        );
        expect(storage.uploads.at(-1)?.token).to.equal(owner.sessionToken);
    });

    it("preserves OrgUnit, pre-authorised and exemption read constraints", async () => {
        const { service, registry } = fixture();
        await service.prepareCreate("user", owner);
        await service.createAuthorized("user", await skillZip(), owner);
        const ready = registry.records.get(recordId)!;
        registry.records.set(recordId, {
            ...ready,
            aspects: {
                ...ready.aspects,
                "access-control": {
                    ownerId: owner.id,
                    orgUnitId: "00000000-0000-4000-8000-000000000700",
                    preAuthorisedPermissionIds: [
                        "00000000-0000-4000-8000-000000000701"
                    ],
                    constraintExemption: true
                }
            }
        });
        const current = await service.prepareExisting(
            "user",
            recordId,
            "update",
            owner
        );
        await service.replaceAuthorized(
            current,
            await skillZip("useful-skill", "Updated"),
            owner
        );
        expect(
            registry.records.get(recordId)?.aspects["access-control"]
        ).to.deep.equal({
            ownerId: owner.id,
            orgUnitId: "00000000-0000-4000-8000-000000000700",
            preAuthorisedPermissionIds: [
                "00000000-0000-4000-8000-000000000701"
            ],
            constraintExemption: true
        });
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

    it("completes deletion with delete permission only", async () => {
        const { service, registry, storage, authorization } = fixture();
        await service.prepareCreate("user", owner);
        await service.createAuthorized("user", await skillZip(), owner);
        authorization.calls = [];
        authorization.decide = (operation) => operation === "delete";
        registry.calls = [];

        const current = await service.prepareExisting(
            "user",
            recordId,
            "delete",
            owner
        );
        await service.deleteAuthorized(current, owner);

        expect(
            authorization.calls.map((call) => call.operation)
        ).to.deep.equal(["delete", "delete"]);
        expect(
            authorization.calls.every(
                (call) => call.token === owner.sessionToken
            )
        ).to.equal(true);
        expect(registry.records.has(recordId)).to.equal(false);
        const deletingPut = registry.calls.find(
            (call) => call.operation === "put"
        );
        expectInternalSession(deletingPut!.token);
        expect(
            registry.calls.find((call) => call.operation === "delete")?.token
        ).to.equal(owner.sessionToken);
        expect(storage.deletions[0].token).to.equal(owner.sessionToken);
    });

    it("keeps read-only access caller-scoped and blocks privileged mutation", async () => {
        const { service, registry, storage, authorization } = fixture();
        await service.createAuthorized("user", await skillZip(), owner);
        authorization.calls = [];
        authorization.decide = (operation) => operation === "read";
        registry.calls = [];
        const writes = registry.writes.length;
        const uploads = storage.uploads.length;

        const readable = await service.prepareExisting(
            "user",
            recordId,
            "read",
            owner
        );
        await service.readAuthorized(readable);
        await service.downloadAuthorized(readable, owner);
        expect(registry.calls[0].token).to.equal(owner.sessionToken);

        for (const operation of ["update", "delete"] as const) {
            let error: unknown;
            try {
                await service.prepareExisting(
                    "user",
                    recordId,
                    operation,
                    otherOwner
                );
            } catch (caught) {
                error = caught;
            }
            expect((error as AgentSkillError).code).to.equal(
                "AGENT_SKILL_NOT_FOUND"
            );
            expect((error as AgentSkillError).status).to.equal(404);
            expect(String((error as Error).message)).not.to.include(
                DEFAULT_ADMIN_USER_ID
            );
        }
        expect(registry.writes).to.have.length(writes);
        expect(storage.uploads).to.have.length(uploads);
        expect(
            authorization.calls.every(
                (call) =>
                    call.token === owner.sessionToken ||
                    call.token === otherOwner.sessionToken
            )
        ).to.equal(true);
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

    it("lists only the caller's READY user publications by default", async () => {
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
                        name,
                        type: "user",
                        userId: recordOwner,
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

        const result = await service.list({ type: "user", limit: 20 }, owner);
        expect(result.records.map((record) => record.id)).to.deep.equal([
            recordId
        ]);
        expect(storage.downloads).to.equal(0);
        expect(registry.listCalls[0].userId).to.deep.equal({
            operator: "eq",
            value: owner.id
        });
        expect(
            authorization.calls.filter((call) => call.operation === "read")
        ).to.have.length(1);
    });

    it("uses Registry-side predicates for default All, My, and Shared catalogues", async () => {
        const registry = new MemoryRegistry();
        const storage = new MemoryStorage();
        const authorization = new TestAuthorization();
        const ownerService = fixture({ registry, storage, authorization })
            .service;
        const otherService = fixture({ registry, storage, authorization })
            .service;
        const systemService = fixture({ registry, storage, authorization })
            .service;
        await ownerService.createAuthorized("user", await skillZip(), owner);
        await otherService.createAuthorized(
            "user",
            await skillZip(),
            otherOwner
        );
        await systemService.createAuthorized(
            "system",
            await skillZip("system-catalogue", "System"),
            admin
        );
        registry.listCalls = [];
        authorization.calls = [];

        const all = await ownerService.list(
            { type: "all", limit: 2, pageToken: "100" },
            owner
        );
        const mine = await ownerService.list(
            { type: "user", limit: 20 },
            owner
        );
        const shared = await ownerService.list(
            { type: "user", userId: "!current", limit: 20 },
            owner
        );

        expect(all.records.map((item) => item.type).sort()).to.deep.equal([
            "system",
            "user"
        ]);
        expect(
            all.records.find((item) => item.type === "user")?.userId
        ).to.equal(owner.id);
        expect(mine.records.map((item) => item.userId)).to.deep.equal([
            owner.id
        ]);
        expect(shared.records.map((item) => item.userId)).to.deep.equal([
            otherOwner.id
        ]);
        expect(registry.listCalls[0]).to.deep.include({
            state: "READY",
            limit: 2,
            pageToken: "100"
        });
        expect(registry.listCalls[0].anyOf).to.deep.equal([
            { field: "type", operator: "eq", value: "system" },
            { field: "userId", operator: "eq", value: owner.id }
        ]);
        expect(registry.listCalls[1]).to.deep.include({
            type: "user",
            userId: { operator: "eq", value: owner.id }
        });
        expect(registry.listCalls[2]).to.deep.include({
            type: "user",
            userId: { operator: "neq", value: owner.id }
        });
        expect(
            authorization.calls.every(
                (call) =>
                    call.operation === "read" &&
                    call.token === owner.sessionToken
            )
        ).to.equal(true);
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
        for (const mutate of [
            (current: AgentSkillRecord): AgentSkillRecord => ({
                ...current,
                name: "INVALID SKILL NAME"
            }),
            (current: AgentSkillRecord): AgentSkillRecord => ({
                ...current,
                aspects: {
                    ...current.aspects,
                    "agent-skill": {
                        ...current.aspects["agent-skill"],
                        name: "different-skill"
                    }
                }
            }),
            (current: AgentSkillRecord): AgentSkillRecord => ({
                ...current,
                aspects: {
                    ...current.aspects,
                    "agent-skill": {
                        ...current.aspects["agent-skill"],
                        userId: otherOwner.id
                    }
                }
            })
        ]) {
            const { service, registry } = fixture();
            await service.prepareCreate("user", owner);
            await service.createAuthorized("user", await skillZip(), owner);
            registry.records.set(
                recordId,
                mutate(registry.records.get(recordId)!)
            );
            const result = await service.list(
                { type: "user", limit: 20 },
                owner
            );
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
        }
    });

    it("rejects a download whose trusted Storage linkage no longer matches", async () => {
        const { service, storage } = fixture();
        await service.createAuthorized("user", await skillZip(), owner);
        const record = await service.prepareExisting(
            "user",
            recordId,
            "read",
            owner
        );
        storage.identities.set(record.aspects["agent-skill"].archiveKey, {
            recordId: "different-record",
            ownerId: otherOwner.id
        });
        let error: unknown;
        try {
            await service.downloadAuthorized(record, owner);
        } catch (caught) {
            error = caught;
        }
        expect((error as AgentSkillError).code).to.equal(
            "AGENT_SKILL_ARCHIVE_LINK_INVALID"
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

    it("honours matching checksum preconditions for replacement and deletion", async () => {
        const { service, registry } = fixture();
        await service.createAuthorized("user", await skillZip(), owner);
        const replacementTarget = await service.prepareExisting(
            "user",
            recordId,
            "update",
            owner
        );
        const originalChecksum =
            replacementTarget.aspects["agent-skill"].checksum;

        const replaced = await service.replaceAuthorized(
            replacementTarget,
            await skillZip("useful-skill", "Updated with precondition"),
            owner,
            originalChecksum
        );
        expect(replaced.checksum).not.to.equal(originalChecksum);

        const deletionTarget = await service.prepareExisting(
            "user",
            recordId,
            "delete",
            owner
        );
        await service.deleteAuthorized(
            deletionTarget,
            owner,
            deletionTarget.aspects["agent-skill"].checksum
        );
        expect(registry.records.has(recordId)).to.equal(false);
    });

    it("rejects stale replacement and deletion checksums with 412 before mutation", async () => {
        for (const operation of ["update", "delete"] as const) {
            const { service, registry, storage } = fixture();
            await service.createAuthorized("user", await skillZip(), owner);
            const prepared = await service.prepareExisting(
                "user",
                recordId,
                operation,
                owner
            );
            const writes = registry.writes.length;
            const uploads = storage.uploads.length;
            const deletions = storage.deletions.length;
            const staleChecksum = "f".repeat(64);

            const error = await (async (): Promise<unknown> => {
                try {
                    if (operation === "update") {
                        await service.replaceAuthorized(
                            prepared,
                            await skillZip(
                                "useful-skill",
                                "Must not be installed"
                            ),
                            owner,
                            staleChecksum
                        );
                    } else {
                        await service.deleteAuthorized(
                            prepared,
                            owner,
                            staleChecksum
                        );
                    }
                    return undefined;
                } catch (caught) {
                    return caught;
                }
            })();

            expect(error).to.be.instanceOf(AgentSkillError);
            expect((error as AgentSkillError).status).to.equal(412);
            expect((error as AgentSkillError).code).to.equal(
                "AGENT_SKILL_PRECONDITION_FAILED"
            );
            expect(registry.writes).to.have.length(writes);
            expect(storage.uploads).to.have.length(uploads);
            expect(storage.deletions).to.have.length(deletions);
            expect(
                registry.records.get(recordId)?.aspects["agent-skill"].state
            ).to.equal("READY");
        }
    });

    it("keeps archive content and session credentials out of audit logs", async () => {
        const { service, registry } = fixture();
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
        const internalToken = registry.calls.find(
            (call) => call.operation === "get"
        )!.token;
        expectInternalSession(internalToken);
        expect(logs[0]).not.to.include(internalToken);
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

        let directError: unknown;
        try {
            await service.createAuthorized("user", await skillZip(), owner);
        } catch (caught) {
            directError = caught;
        }
        expect((directError as AgentSkillError).status).to.equal(403);
        expect(registry.getCalls).to.equal(0);
        expect(registry.records.size).to.equal(0);
        expect(storage.uploads).to.have.length(0);
    });
});
