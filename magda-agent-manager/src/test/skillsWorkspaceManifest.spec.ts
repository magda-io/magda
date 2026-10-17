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

const user: AuthenticatedUser = {
    id: "00000000-0000-4000-8000-000000000123",
    sessionToken: "caller-session"
};
const otherUserId = "00000000-0000-4000-8000-000000000456";

function record(
    type: "system" | "user",
    name: string,
    intendedUserId = user.id
): AgentSkillRecord {
    const id =
        type === "system"
            ? `agent-skill-${name}`
            : `agent-skill-${intendedUserId}-${name}`;
    return {
        id,
        name,
        tenantId: 0,
        aspects: {
            "agent-skill": {
                name,
                type,
                ...(type === "user" ? { userId: intendedUserId } : {}),
                createdAt: "2026-10-13T12:00:00.000Z",
                createdBy: intendedUserId,
                description: `${name} description`,
                archiveKey:
                    type === "system"
                        ? `agent-services/skills/system-skills/${id}.zip`
                        : `agent-services/skills/user-skills/${intendedUserId}/${id}.zip`,
                updatedAt: "2026-10-13T12:00:00.000Z",
                updatedBy: intendedUserId,
                checksum: "0".repeat(64),
                state: "READY"
            },
            "access-control": { ownerId: intendedUserId }
        }
    };
}

class ManifestRegistry implements AgentSkillRegistry {
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

class ManifestAuthorization implements AgentSkillAuthorization {
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
    authorization: AgentSkillAuthorization = new ManifestAuthorization()
): AgentSkillService {
    return new AgentSkillService({
        registry,
        authorization,
        storage: ({} as unknown) as AgentSkillStorage,
        tenantId: 0,
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

describe("Agent Skill workspace manifest", () => {
    it("independently exhausts system and own-user pages with exact caller-scoped filters", async () => {
        const pages = new Map<string, RegistryRecordsPage>([
            [
                "system:first",
                {
                    records: [record("system", "system-zulu")],
                    hasMore: true,
                    nextPageToken: "shared-opaque-token"
                }
            ],
            [
                "system:shared-opaque-token",
                {
                    records: [record("system", "system-bravo")],
                    hasMore: true,
                    nextPageToken: "system-page-3"
                }
            ],
            ["system:system-page-3", { records: [], hasMore: false }],
            [
                "user:first",
                {
                    records: [record("user", "alpha")],
                    hasMore: true,
                    nextPageToken: "shared-opaque-token"
                }
            ],
            [
                "user:shared-opaque-token",
                {
                    records: [record("user", "charlie")],
                    hasMore: true,
                    nextPageToken: "user-page-3"
                }
            ],
            ["user:user-page-3", { records: [], hasMore: false }]
        ]);
        const registry = new ManifestRegistry((options) => {
            const key = `${options.type}:${options.pageToken || "first"}`;
            const page = pages.get(key);
            if (!page) throw new Error(`unexpected page ${key}`);
            return page;
        });
        const authorization = new ManifestAuthorization();

        const result = await service(
            registry,
            authorization
        ).getWorkspaceSkillManifest(user);

        expect(registry.calls).to.deep.equal([
            {
                options: { type: "system", state: "READY", limit: 100 },
                token: user.sessionToken
            },
            {
                options: {
                    type: "system",
                    state: "READY",
                    limit: 100,
                    pageToken: "shared-opaque-token"
                },
                token: user.sessionToken
            },
            {
                options: {
                    type: "system",
                    state: "READY",
                    limit: 100,
                    pageToken: "system-page-3"
                },
                token: user.sessionToken
            },
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
                    pageToken: "shared-opaque-token"
                },
                token: user.sessionToken
            },
            {
                options: {
                    type: "user",
                    state: "READY",
                    userId: { operator: "eq", value: user.id },
                    limit: 100,
                    pageToken: "user-page-3"
                },
                token: user.sessionToken
            }
        ]);
        expect(result.items.map((item) => item.effectiveName)).to.deep.equal([
            "alpha",
            "charlie",
            "system-bravo",
            "system-zulu"
        ]);
        expect(result.items.map((item) => item.sourceKind)).to.deep.equal([
            "own-user-publication",
            "own-user-publication",
            "system-publication",
            "system-publication"
        ]);
        expect(result.warnings).to.deep.equal([]);
        expect(result.sources).to.deep.equal({
            system: { complete: true, count: 2 },
            user: { complete: true, count: 2 },
            installations: { status: "notImplemented", count: 0 }
        });
        expect(
            authorization.calls.every(
                (call) => call.token === user.sessionToken
            )
        ).to.equal(true);
    });

    it("skips invalid and read-denied records with source-specific warnings", async () => {
        const denied = record("system", "system-denied");
        const allowed = record("system", "system-allowed");
        const own = record("user", "mine");
        const wrongUser = record("user", "not-mine", otherUserId);
        const registry = new ManifestRegistry((options) =>
            options.type === "system"
                ? {
                      records: [{ id: "malformed-system" }, denied, allowed],
                      hasMore: false
                  }
                : {
                      records: [wrongUser, { id: "malformed-user" }, own],
                      hasMore: false
                  }
        );
        const authorization = new ManifestAuthorization(
            (skill) => skill.id !== denied.id
        );

        const result = await service(
            registry,
            authorization
        ).getWorkspaceSkillManifest(user);

        expect(result.items.map((item) => item.selectionId)).to.deep.equal([
            own.id,
            allowed.id
        ]);
        expect(result.warnings).to.deep.equal([
            {
                sourceKind: "system-publication",
                code: "INVALID_RECORD",
                recordId: "malformed-system"
            },
            {
                sourceKind: "system-publication",
                code: "READ_DENIED",
                recordId: denied.id
            },
            {
                sourceKind: "own-user-publication",
                code: "INVALID_RECORD",
                recordId: wrongUser.id
            },
            {
                sourceKind: "own-user-publication",
                code: "INVALID_RECORD",
                recordId: "malformed-user"
            }
        ]);
        expect(authorization.calls.map((call) => call.recordId)).to.deep.equal([
            denied.id,
            allowed.id,
            own.id
        ]);
    });

    it("rejects Registry and authorization infrastructure failures", async () => {
        const registryFailure = new DownstreamServiceError(
            "registry",
            503,
            "registry unavailable"
        );
        const failingRegistry = new ManifestRegistry(() => {
            throw registryFailure;
        });
        expect(
            await caught(
                service(failingRegistry).getWorkspaceSkillManifest(user)
            )
        ).to.equal(registryFailure);

        const authorizationFailure = new DownstreamServiceError(
            "authorization",
            503,
            "authorization unavailable"
        );
        const populatedRegistry = new ManifestRegistry((options) => ({
            records:
                options.type === "system"
                    ? [record("system", "system-readable")]
                    : [],
            hasMore: false
        }));
        const failingAuthorization = new ManifestAuthorization(() => {
            throw authorizationFailure;
        });
        expect(
            await caught(
                service(
                    populatedRegistry,
                    failingAuthorization
                ).getWorkspaceSkillManifest(user)
            )
        ).to.equal(authorizationFailure);
    });

    it("rejects a repeated continuation token within one source", async () => {
        const registry = new ManifestRegistry((options) => {
            if (options.type === "user") {
                throw new Error(
                    "user source must not run after system failure"
                );
            }
            return {
                records: [],
                hasMore: true,
                nextPageToken: "cycle"
            };
        });

        const error = await caught(
            service(registry).getWorkspaceSkillManifest(user)
        );
        expect(error).to.be.instanceOf(DownstreamServiceError);
        expect((error as DownstreamServiceError).service).to.equal("registry");
        expect((error as DownstreamServiceError).status).to.equal(502);
        expect(
            registry.calls.map((call) => call.options.pageToken)
        ).to.deep.equal([undefined, "cycle"]);
    });

    it("returns a complete empty manifest after both sources succeed empty", async () => {
        const registry = new ManifestRegistry(() => ({
            records: [],
            hasMore: false
        }));

        const result = await service(registry).getWorkspaceSkillManifest(user);

        expect(result).to.deep.equal({
            version: 1,
            complete: true,
            identity: { tenantId: "0", userId: user.id },
            items: [],
            warnings: [],
            sources: {
                system: { complete: true, count: 0 },
                user: { complete: true, count: 0 },
                installations: { status: "notImplemented", count: 0 }
            }
        });
        expect(registry.calls).to.have.length(2);
        expect(
            registry.calls.every((call) => call.token === user.sessionToken)
        ).to.equal(true);
    });
});
