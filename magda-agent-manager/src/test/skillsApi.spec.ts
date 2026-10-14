import { expect } from "chai";
import jwt from "jsonwebtoken";
import request from "supertest";
import { AgentManager } from "../manager.js";
import buildApp from "../buildApp.js";
import {
    AgentAuthorizationError,
    authenticateAdminToken,
    authenticateUserToken
} from "../auth.js";
import { AgentSkillError, AgentSkillService } from "../skills/service.js";
import { AgentSkillRecord } from "../skills/types.js";
import { ManagerConfig } from "../types.js";

const jwtSecret = "skills-test-secret";
const userId = "00000000-0000-4000-8000-000000000123";
const recordId = `agent-skill-${userId}-useful-skill`;

function config(): ManagerConfig {
    return {
        port: 8080,
        jwtSecret,
        namespace: "magda-agent",
        installationId: "test-installation",
        warmPool: "pool",
        authApiUrl: "http://authorization-api/v0",
        registryApiUrl: "http://registry-api/v0",
        storageApiUrl: "http://storage-api/v0",
        defaultStorageBucket: "magda-datasets",
        tenantId: 0,
        skillArchiveMaxCompressedBytes: 64,
        skillArchiveMaxUncompressedBytes: 1024,
        skillArchiveMaxEntries: 16,
        skillArchiveMaxPathLength: 120,
        skillArchiveMaxNestingDepth: 5,
        skillArchiveMaxMarkdownBytes: 512,
        systemUserId: "00000000-0000-4000-8000-000000000000",
        managedApiKeyName: "agent-key",
        externalUrl: "https://magda.test",
        externalAuthority: "magda.test",
        runtimePrefix: "/v0/runtime",
        sandboxPort: 3080,
        agentContainer: "agent",
        launchTokenFile: "/token",
        bootstrapCommand: "/bootstrap",
        magdaApiUrl: "https://magda.test/api",
        llmApiUrl: "https://magda.test/api/v0/llm/v1",
        llmModel: "model",
        llmContextWindow: 1000,
        llmMaxTokens: 100,
        hardDeleteSeconds: 100,
        idleSuspendSeconds: 50,
        reconcileIntervalSeconds: 10,
        runtimeMaxBodyBytes: 1024,
        controlPlaneSecret: "control"
    };
}

function token(id = userId): string {
    return jwt.sign({ userId: id }, jwtSecret, { algorithm: "HS256" });
}

const metadata = {
    id: recordId,
    name: "useful-skill",
    description: "Useful",
    scope: "user" as const,
    ownerId: userId,
    createdAt: "2026-10-13T12:00:00.000Z",
    createdBy: userId,
    updatedAt: "2026-10-13T12:00:00.000Z",
    updatedBy: userId,
    checksum: "0".repeat(64)
};

function skillRecord(): AgentSkillRecord {
    return {
        id: recordId,
        name: metadata.name,
        tenantId: 0,
        aspects: {
            "agent-skill": {
                name: metadata.name,
                scope: "user",
                createdAt: metadata.createdAt,
                createdBy: userId,
                description: metadata.description,
                archiveKey: `agent-services/skills/user-skills/${userId}/${recordId}.zip`,
                updatedAt: metadata.updatedAt,
                updatedBy: userId,
                checksum: metadata.checksum,
                state: "READY"
            },
            "access-control": { ownerId: userId }
        }
    };
}

describe("Agent Skill authentication and API boundary", () => {
    let originalFetch: typeof globalThis.fetch;
    let roles: Array<{ id: string }>;
    let whoamiId: string;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
        roles = [{ id: "00000000-0000-0002-0000-000000000000" }];
        whoamiId = userId;
        globalThis.fetch = (async () =>
            new Response(JSON.stringify({ id: whoamiId, roles }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            })) as typeof globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("accepts a verified ordinary user without weakening admin authentication", async () => {
        expect(
            (
                await authenticateUserToken(token(), {
                    jwtSecret,
                    authApiUrl: "http://authorization-api/v0"
                })
            ).id
        ).to.equal(userId);

        let error: unknown;
        try {
            await authenticateAdminToken(token(), {
                jwtSecret,
                authApiUrl: "http://authorization-api/v0"
            });
        } catch (caught) {
            error = caught;
        }
        expect(error).to.be.instanceOf(AgentAuthorizationError);
        expect((error as AgentAuthorizationError).status).to.equal(403);
    });

    it("rejects a signed token when whoami resolves a different actor", async () => {
        whoamiId = "00000000-0000-4000-8000-000000000999";
        let error: unknown;
        try {
            await authenticateUserToken(token(), {
                jwtSecret,
                authApiUrl: "http://authorization-api/v0"
            });
        } catch (caught) {
            error = caught;
        }
        expect((error as AgentAuthorizationError).status).to.equal(401);
    });

    it("rejects missing and invalid sessions before calling the skill service", async () => {
        let listCalls = 0;
        const service = ({
            list: async () => {
                listCalls += 1;
                return { records: [], hasMore: false };
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);

        const missing = await request(app).get("/v0/skills?scope=user");
        const invalid = await request(app)
            .get("/v0/skills?scope=user")
            .set("X-Magda-Session", "not-a-jwt");
        expect(missing.status).to.equal(401);
        expect(invalid.status).to.equal(401);
        expect(listCalls).to.equal(0);
    });

    it("runs create authorization before MIME and body-size parsing", async () => {
        let createCalls = 0;
        const service = ({
            prepareCreate: async () => {
                throw new AgentSkillError(
                    "denied",
                    403,
                    "AGENT_SKILL_FORBIDDEN"
                );
            },
            createAuthorized: async () => {
                createCalls += 1;
                throw new Error("must not run");
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);

        const response = await request(app)
            .post("/v0/skills/user")
            .set("X-Magda-Session", token())
            .set("Content-Type", "application/zip")
            .send(Buffer.alloc(1024));

        expect(response.status).to.equal(403);
        expect(createCalls).to.equal(0);
    });

    it("publishes the stable route shape and Location header", async () => {
        let prepared = false;
        const service = ({
            prepareCreate: async (scope: string) => {
                prepared = scope === "user";
            },
            createAuthorized: async () => ({
                id: recordId,
                name: "useful-skill",
                description: "Useful",
                scope: "user",
                ownerId: userId,
                createdAt: "2026-10-13T12:00:00.000Z",
                createdBy: userId,
                updatedAt: "2026-10-13T12:00:00.000Z",
                updatedBy: userId,
                checksum: "0".repeat(64)
            })
        } as unknown) as AgentSkillService;
        const apiConfig = config();
        apiConfig.skillArchiveMaxCompressedBytes = 1024;
        const app = buildApp(apiConfig, {} as AgentManager, service);

        const response = await request(app)
            .post("/v0/skills/user")
            .set("X-Magda-Session", token())
            .set("Content-Type", "application/zip")
            .send(Buffer.from("zip"));

        expect(response.status).to.equal(201);
        expect(prepared).to.equal(true);
        expect(response.headers.location).to.equal(
            `/v0/skills/user/${recordId}`
        );
        expect(response.body.name).to.equal("useful-skill");
    });

    it("rejects caller-selected record IDs", async () => {
        let prepareCalls = 0;
        const service = ({
            prepareCreate: async () => {
                prepareCalls += 1;
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);
        const response = await request(app)
            .post(`/v0/skills/user?id=${encodeURIComponent(recordId)}`)
            .set("X-Magda-Session", token())
            .set("Content-Type", "application/zip")
            .send(Buffer.from("zip"));
        expect(response.status).to.equal(400);
        expect(response.body.error.code).to.equal("CALLER_SELECTED_SKILL_ID");
        expect(prepareCalls).to.equal(0);
    });

    it("supports list, metadata, ZIP, replace and delete route contracts", async () => {
        const calls: string[] = [];
        let listRequest: unknown;
        const record = skillRecord();
        const service = ({
            list: async (options: unknown) => {
                listRequest = options;
                return {
                    records: [metadata],
                    hasMore: true,
                    nextPageToken: "page-2"
                };
            },
            prepareExisting: async (
                _scope: string,
                _id: string,
                operation: string
            ) => {
                calls.push(`prepare:${operation}`);
                return record;
            },
            readAuthorized: async () => metadata,
            downloadAuthorized: async () => Buffer.from("zip-body"),
            replaceAuthorized: async () => {
                calls.push("replace");
                return { ...metadata, updatedBy: userId };
            },
            deleteAuthorized: async () => {
                calls.push("delete");
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);
        const session = token();

        const list = await request(app)
            .get("/v0/skills?scope=user&limit=7&pageToken=page-1&q=useful")
            .set("X-Magda-Session", session);
        expect(list.status).to.equal(200);
        expect(list.body).to.deep.equal({
            items: [metadata],
            hasMore: true,
            nextPageToken: "page-2"
        });
        expect(listRequest).to.deep.equal({
            scope: "user",
            limit: 7,
            pageToken: "page-1",
            q: "useful"
        });

        const read = await request(app)
            .get(`/v0/skills/user/${recordId}`)
            .set("X-Magda-Session", session);
        expect(read.status).to.equal(200);
        expect(read.body).to.deep.equal(metadata);

        const archive = await request(app)
            .get(`/v0/skills/user/${recordId}/archive`)
            .set("X-Magda-Session", session)
            .buffer(true);
        expect(archive.status).to.equal(200);
        expect(archive.headers["content-type"]).to.match(/^application\/zip/);
        expect(archive.headers.etag).to.equal(`"${metadata.checksum}"`);
        expect(archive.headers["content-disposition"]).to.include(
            `useful-skill-${recordId}.zip`
        );

        const replace = await request(app)
            .put(`/v0/skills/user/${recordId}/archive`)
            .set("X-Magda-Session", session)
            .set("Content-Type", "application/zip")
            .send(Buffer.from("new-zip"));
        expect(replace.status).to.equal(200);
        expect(replace.body.name).to.equal("useful-skill");

        const deleted = await request(app)
            .delete(`/v0/skills/user/${recordId}`)
            .set("X-Magda-Session", session);
        expect(deleted.status).to.equal(204);
        expect(calls).to.include.members([
            "prepare:read",
            "prepare:update",
            "prepare:delete",
            "replace",
            "delete"
        ]);
    });

    it("bounds concurrent buffered uploads before service queuing", async () => {
        let activeCalls = 0;
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const service = ({
            prepareCreate: async () => recordId,
            createAuthorized: async () => {
                activeCalls += 1;
                await gate;
                return metadata;
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);
        const startUpload = () =>
            request(app)
                .post("/v0/skills/user")
                .set("X-Magda-Session", token())
                .set("Content-Type", "application/zip")
                .send(Buffer.from("zip"));
        const admitted = [0, 1, 2, 3].map(() =>
            startUpload().then((response) => response)
        );
        for (let attempt = 0; attempt < 100 && activeCalls < 4; attempt += 1) {
            await new Promise((resolve) => setImmediate(resolve));
        }
        expect(activeCalls).to.equal(4);
        const rejected = await startUpload();
        expect(rejected.status).to.equal(429);
        expect(rejected.body.error.code).to.equal("AGENT_SKILL_UPLOAD_BUSY");
        release();
        const completed = await Promise.all(admitted);
        expect(completed.every((response) => response.status === 201)).to.equal(
            true
        );
    });

    it("keeps lifecycle endpoints admin-only for ordinary users", async () => {
        const app = buildApp(config(), {} as AgentManager);
        const response = await request(app)
            .get("/v0/session")
            .set("X-Magda-Session", token());
        expect(response.status).to.equal(403);
    });
});
