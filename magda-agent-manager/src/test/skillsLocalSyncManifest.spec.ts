import { expect } from "chai";
import { DownstreamServiceError } from "../skills/clients.js";
import { AgentSkillService } from "../skills/service.js";
import {
    AgentSkillAuthorization,
    AgentSkillRecord,
    AgentSkillRegistry,
    AgentSkillStorage,
    RegistryListOptions,
    RegistryRecordsPage
} from "../skills/types.js";
import { AuthenticatedUser } from "../types.js";
import { noInstallations, noShareGroups } from "./skillSharingWorld.js";

const user: AuthenticatedUser = {
    id: "00000000-0000-4000-8000-000000000123",
    sessionToken: "caller-session"
};
const otherUserId = "00000000-0000-4000-8000-000000000456";

function record(
    name: string,
    userId = user.id,
    state: "PENDING" | "READY" | "DELETING" = "READY"
): AgentSkillRecord {
    const id = `agent-skill-${userId}-${name}`;
    return {
        id,
        name,
        tenantId: 7,
        aspects: {
            "agent-skill": {
                name,
                type: "user",
                userId,
                createdAt: "2026-10-13T12:00:00.000Z",
                createdBy: userId,
                description: `${name} description`,
                archiveKey: `agent-services/skills/user-skills/${userId}/${id}.zip`,
                updatedAt: "2026-10-13T12:00:00.000Z",
                updatedBy: userId,
                checksum: "0".repeat(64),
                state
            },
            "access-control": { ownerId: userId }
        }
    };
}

class LocalManifestRegistry implements AgentSkillRegistry {
    readonly calls: Array<{ options: RegistryListOptions; token: string }> = [];

    constructor(
        private readonly listPage: (
            options: RegistryListOptions,
            callNumber: number
        ) => Promise<RegistryRecordsPage> | RegistryRecordsPage
    ) {}

    async list(
        options: RegistryListOptions,
        token: string
    ): Promise<RegistryRecordsPage> {
        this.calls.push({ options: structuredClone(options), token });
        return await this.listPage(options, this.calls.length);
    }

    async get(): Promise<undefined> {
        return undefined;
    }
    async create(): Promise<never> {
        throw new Error("not used");
    }
    async put(): Promise<never> {
        throw new Error("not used");
    }
    async delete(): Promise<void> {
        throw new Error("not used");
    }
}

class LocalManifestAuthorization implements AgentSkillAuthorization {
    readonly calls: Array<{ recordId: string; token: string }> = [];

    constructor(
        private readonly decision: (
            record: AgentSkillRecord
        ) => Promise<boolean> | boolean = () => true
    ) {}

    async can(
        operation: "create" | "read" | "update" | "delete",
        skill: AgentSkillRecord,
        token: string
    ): Promise<boolean> {
        expect(operation).to.equal("read");
        this.calls.push({ recordId: skill.id, token });
        return await this.decision(skill);
    }
}

function service(
    registry: AgentSkillRegistry,
    authorization: AgentSkillAuthorization = new LocalManifestAuthorization()
): AgentSkillService {
    return new AgentSkillService({
        installationRegistry: noInstallations(),
        installationAuthorization: noInstallations(),
        shareGroups: noShareGroups(),
        registry,
        authorization,
        storage: ({} as unknown) as AgentSkillStorage,
        tenantId: 7,
        jwtSecret: "manifest-test-secret",
        archiveLimits: {
            maxCompressedBytes: 1024,
            maxUncompressedBytes: 2048,
            maxEntries: 10,
            maxPathLength: 120,
            maxNestingDepth: 5,
            maxSkillMarkdownBytes: 512
        }
    });
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
        return undefined;
    } catch (error) {
        return error;
    }
}

describe("Agent Skill local sync manifest", () => {
    it("fully paginates only READY own-user publications with caller identity and token", async () => {
        const pages = new Map<string, RegistryRecordsPage>([
            [
                "first",
                {
                    records: [record("zulu")],
                    hasMore: true,
                    nextPageToken: "opaque-2"
                }
            ],
            [
                "opaque-2",
                {
                    records: [record("alpha")],
                    hasMore: true,
                    nextPageToken: "opaque-3"
                }
            ],
            ["opaque-3", { records: [], hasMore: false }]
        ]);
        const registry = new LocalManifestRegistry((options) => {
            const page = pages.get(options.pageToken || "first");
            if (!page) throw new Error("unexpected page");
            return page;
        });
        const authorization = new LocalManifestAuthorization();

        const result = await service(
            registry,
            authorization
        ).getLocalSkillSyncManifest(user);

        expect(registry.calls).to.deep.equal([
            {
                options: {
                    type: "user",
                    state: "READY",
                    userId: { operator: "eq", value: user.id },
                    limit: 100
                },
                token: user.sessionToken
            },
            {
                options: {
                    type: "user",
                    state: "READY",
                    userId: { operator: "eq", value: user.id },
                    limit: 100,
                    pageToken: "opaque-2"
                },
                token: user.sessionToken
            },
            {
                options: {
                    type: "user",
                    state: "READY",
                    userId: { operator: "eq", value: user.id },
                    limit: 100,
                    pageToken: "opaque-3"
                },
                token: user.sessionToken
            }
        ]);
        expect(result).to.deep.equal({
            version: 1,
            complete: true,
            identity: { tenantId: "7", userId: user.id },
            items: [
                {
                    selectionId: record("alpha").id,
                    effectiveName: "alpha",
                    sourceKind: "own-user-publication",
                    source: {
                        id: record("alpha").id,
                        name: "alpha",
                        description: "alpha description",
                        type: "user",
                        userId: user.id,
                        ownerId: user.id,
                        createdAt: "2026-10-13T12:00:00.000Z",
                        createdBy: user.id,
                        updatedAt: "2026-10-13T12:00:00.000Z",
                        updatedBy: user.id,
                        checksum: "0".repeat(64)
                    }
                },
                {
                    selectionId: record("zulu").id,
                    effectiveName: "zulu",
                    sourceKind: "own-user-publication",
                    source: {
                        id: record("zulu").id,
                        name: "zulu",
                        description: "zulu description",
                        type: "user",
                        userId: user.id,
                        ownerId: user.id,
                        createdAt: "2026-10-13T12:00:00.000Z",
                        createdBy: user.id,
                        updatedAt: "2026-10-13T12:00:00.000Z",
                        updatedBy: user.id,
                        checksum: "0".repeat(64)
                    }
                }
            ],
            warnings: [],
            unavailableInstallations: [],
            sources: {
                user: { complete: true, count: 2 },
                installations: { complete: true, count: 0, unavailable: 0 }
            }
        });
        expect(
            authorization.calls.every(
                (call) => call.token === user.sessionToken
            )
        ).to.equal(true);
    });

    it("validates source membership before read authorization and bounds warnings", async () => {
        const denied = record("denied");
        const allowed = record("allowed");
        const wrongUser = record("other", otherUserId);
        const notReady = record("pending", user.id, "PENDING");
        const malformed = Array.from({ length: 105 }, (_, index) => ({
            id: `malformed-${index}`
        }));
        const registry = new LocalManifestRegistry(() => ({
            records: [
                wrongUser,
                notReady,
                denied,
                denied,
                allowed,
                ...malformed
            ],
            hasMore: false
        }));
        const authorization = new LocalManifestAuthorization(
            (skill) => skill.id !== denied.id
        );

        const result = await service(
            registry,
            authorization
        ).getLocalSkillSyncManifest(user);

        expect(result.items.map((item) => item.selectionId)).to.deep.equal([
            allowed.id
        ]);
        expect(result.warnings).to.have.length(100);
        expect(result.warnings.slice(0, 4)).to.deep.equal([
            {
                sourceKind: "own-user-publication",
                code: "INVALID_RECORD",
                recordId: wrongUser.id
            },
            {
                sourceKind: "own-user-publication",
                code: "INVALID_RECORD",
                recordId: notReady.id
            },
            {
                sourceKind: "own-user-publication",
                code: "READ_DENIED",
                recordId: denied.id
            },
            {
                sourceKind: "own-user-publication",
                code: "DUPLICATE_RECORD",
                recordId: denied.id
            }
        ]);
        expect(authorization.calls.map((call) => call.recordId)).to.deep.equal([
            denied.id,
            allowed.id
        ]);
    });

    it("fails the whole manifest on Registry or authorization outages", async () => {
        const registryFailure = new DownstreamServiceError(
            "registry",
            503,
            "registry unavailable"
        );
        const failingRegistry = new LocalManifestRegistry(() => {
            throw registryFailure;
        });
        expect(
            await caught(
                service(failingRegistry).getLocalSkillSyncManifest(user)
            )
        ).to.equal(registryFailure);

        const authorizationFailure = new DownstreamServiceError(
            "authorization",
            503,
            "authorization unavailable"
        );
        const populatedRegistry = new LocalManifestRegistry(() => ({
            records: [record("readable")],
            hasMore: false
        }));
        const failingAuthorization = new LocalManifestAuthorization(() => {
            throw authorizationFailure;
        });
        expect(
            await caught(
                service(
                    populatedRegistry,
                    failingAuthorization
                ).getLocalSkillSyncManifest(user)
            )
        ).to.equal(authorizationFailure);
    });

    it("rejects a repeated continuation token", async () => {
        const registry = new LocalManifestRegistry(() => ({
            records: [],
            hasMore: true,
            nextPageToken: "cycle"
        }));

        const error = await caught(
            service(registry).getLocalSkillSyncManifest(user)
        );

        expect(error).to.be.instanceOf(DownstreamServiceError);
        expect((error as DownstreamServiceError).service).to.equal("registry");
        expect((error as DownstreamServiceError).status).to.equal(502);
        expect(
            registry.calls.map((call) => call.options.pageToken)
        ).to.deep.equal([undefined, "cycle"]);
    });
});
