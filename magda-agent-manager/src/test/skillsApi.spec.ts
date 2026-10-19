import { expect } from "chai";
import jwt from "jsonwebtoken";
import request from "supertest";
import { AgentManager } from "../manager.js";
import buildApp from "../buildApp.js";
import {
    AgentAuthorizationError,
    authenticateUserToken,
    authenticateWorkspaceToken
} from "../auth.js";
import { DownstreamServiceError } from "../skills/clients.js";
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
    type: "user" as const,
    userId,
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
                type: "user",
                userId,
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
        globalThis.fetch = (async (url: string | URL | Request) =>
            new Response(
                JSON.stringify(
                    String(url).includes("/opa/decision/")
                        ? // An ordinary user holds no `agentWorkspace/access`.
                          { hasResidualRules: false, result: false }
                        : { id: whoamiId, roles }
                ),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                }
            )) as typeof globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("accepts a verified ordinary user without granting Workspace access", async () => {
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
            await authenticateWorkspaceToken(token(), {
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

        const missing = await request(app).get("/v0/skills?type=user");
        const invalid = await request(app)
            .get("/v0/skills?type=user")
            .set("X-Magda-Session", "not-a-jwt");
        expect(missing.status).to.equal(401);
        expect(invalid.status).to.equal(401);
        expect(listCalls).to.equal(0);
    });

    it("rejects the obsolete scope query instead of silently widening it", async () => {
        let listCalls = 0;
        const service = ({
            list: async () => {
                listCalls += 1;
                return { records: [], hasMore: false };
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);
        const response = await request(app)
            .get("/v0/skills?scope=user")
            .set("X-Magda-Session", token());
        expect(response.status).to.equal(400);
        expect(response.body.error.code).to.equal("INVALID_TYPE");
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
            prepareCreate: async (type: string) => {
                prepared = type === "user";
            },
            createAuthorized: async () => ({
                id: recordId,
                name: "useful-skill",
                description: "Useful",
                type: "user",
                userId,
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
            `/api/v0/agent/skills/user/${recordId}`
        );
        expect(response.body.name).to.equal("useful-skill");
        expect(response.body.type).to.equal("user");
        expect(response.body.userId).to.equal(userId);
    });

    it("rejects caller-selected record, intended-user and owner identities", async () => {
        let prepareCalls = 0;
        const service = ({
            prepareCreate: async () => {
                prepareCalls += 1;
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);
        for (const [key, value] of [
            ["id", recordId],
            ["userId", userId],
            ["ownerId", userId]
        ]) {
            const response = await request(app)
                .post(`/v0/skills/user?${key}=${encodeURIComponent(value)}`)
                .set("X-Magda-Session", token())
                .set("Content-Type", "application/zip")
                .send(Buffer.from("zip"));
            expect(response.status).to.equal(400);
            expect(response.body.error.code).to.equal(
                "CALLER_SELECTED_SKILL_IDENTITY"
            );
        }
        expect(prepareCalls).to.equal(0);
    });

    it("accepts only server-resolved My and Shared catalogue selectors", async () => {
        const requests: unknown[] = [];
        const service = ({
            list: async (options: unknown) => {
                requests.push(options);
                return { records: [], hasMore: false };
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);
        const session = token();

        for (const selector of ["current", "!current"]) {
            const response = await request(app)
                .get(`/v0/skills?userId=${encodeURIComponent(selector)}`)
                .set("X-Magda-Session", session);
            expect(response.status).to.equal(200);
        }
        expect(requests).to.deep.equal([
            {
                type: "all",
                userId: "current",
                limit: 20,
                pageToken: undefined,
                q: undefined
            },
            {
                type: "all",
                userId: "!current",
                limit: 20,
                pageToken: undefined,
                q: undefined
            }
        ]);

        for (const query of [
            `userId=${userId}`,
            "userId=!CURRENT",
            "userId=",
            "type=system&userId=current"
        ]) {
            const response = await request(app)
                .get(`/v0/skills?${query}`)
                .set("X-Magda-Session", session);
            expect(response.status).to.equal(400);
            expect(response.body.error.code).to.equal("INVALID_USERID");
        }
        expect(requests).to.have.length(2);
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
                _type: string,
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
            .get(
                "/v0/skills?type=user&userId=current&limit=7&pageToken=page-1&q=useful"
            )
            .set("X-Magda-Session", session);
        expect(list.status).to.equal(200);
        expect(list.body).to.deep.equal({
            items: [metadata],
            hasMore: true,
            nextPageToken: "page-2"
        });
        expect(listRequest).to.deep.equal({
            type: "user",
            userId: "current",
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
            .set("If-Match", `"${metadata.checksum}"`)
            .set("Content-Type", "application/zip")
            .send(Buffer.from("new-zip"));
        expect(replace.status).to.equal(200);
        expect(replace.body.name).to.equal("useful-skill");

        const deleted = await request(app)
            .delete(`/v0/skills/user/${recordId}`)
            .set("X-Magda-Session", session)
            .set("If-Match", `"${metadata.checksum}"`);
        expect(deleted.status).to.equal(204);
        expect(calls).to.include.members([
            "prepare:read",
            "prepare:update",
            "prepare:delete",
            "replace",
            "delete"
        ]);
    });

    it("protects the local sync manifest and returns caller identity without caching", async () => {
        const callers: Array<{ id: string; sessionToken: string }> = [];
        const expected = {
            version: 1 as const,
            complete: true as const,
            identity: { tenantId: "0", userId },
            items: [],
            warnings: [],
            sources: {
                user: { complete: true as const, count: 0 },
                installations: {
                    status: "notImplemented" as const,
                    count: 0 as const
                }
            }
        };
        const service = ({
            getLocalSkillSyncManifest: async (caller: {
                id: string;
                sessionToken: string;
            }) => {
                callers.push(caller);
                return expected;
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);
        const session = token();

        const missing = await request(app).get(
            "/v0/skills/local-sync-manifest"
        );
        const invalid = await request(app)
            .get("/v0/skills/local-sync-manifest")
            .set("X-Magda-Session", "not-a-jwt");
        const accepted = await request(app)
            .get("/v0/skills/local-sync-manifest")
            .set("X-Magda-Session", session);

        expect(missing.status).to.equal(401);
        expect(invalid.status).to.equal(401);
        expect(accepted.status).to.equal(200);
        expect(accepted.headers["cache-control"]).to.equal("private, no-store");
        expect(accepted.body).to.deep.equal(expected);
        expect(callers).to.deep.equal([{ id: userId, sessionToken: session }]);
    });

    it("rejects every local sync manifest query parameter before service dispatch", async () => {
        let manifestCalls = 0;
        const service = ({
            getLocalSkillSyncManifest: async () => {
                manifestCalls += 1;
                throw new Error("must not run");
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);

        for (const query of [
            "limit=1",
            "pageToken=opaque",
            "type=user",
            "userId=current",
            "q=skill"
        ]) {
            const response = await request(app)
                .get(`/v0/skills/local-sync-manifest?${query}`)
                .set("X-Magda-Session", token());
            expect(response.status).to.equal(400);
            expect(response.body.error.code).to.equal(
                "INVALID_LOCAL_SYNC_MANIFEST_QUERY"
            );
        }
        expect(manifestCalls).to.equal(0);
    });

    it("reports local sync manifest downstream outages as retryable", async () => {
        const service = ({
            getLocalSkillSyncManifest: async () => {
                throw new DownstreamServiceError(
                    "authorization",
                    503,
                    "Authorization service is unavailable"
                );
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);

        const response = await request(app)
            .get("/v0/skills/local-sync-manifest")
            .set("X-Magda-Session", token());

        expect(response.status).to.equal(503);
        expect(response.body.error).to.deep.equal({
            code: "AUTHORIZATION_ERROR",
            message: "Authorization service is unavailable",
            retryable: true
        });
    });

    it("protects the workspace manifest route with ordinary-user authentication", async () => {
        let manifestCalls = 0;
        const service = ({
            getWorkspaceSkillManifest: async () => {
                manifestCalls += 1;
                return {
                    version: 1,
                    complete: true,
                    items: [],
                    warnings: [],
                    sources: {
                        system: { complete: true, count: 0 },
                        user: { complete: true, count: 0 },
                        installations: {
                            status: "notImplemented",
                            count: 0
                        }
                    }
                };
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);

        const missing = await request(app).get("/v0/skills/workspace-manifest");
        const invalid = await request(app)
            .get("/v0/skills/workspace-manifest")
            .set("X-Magda-Session", "not-a-jwt");
        const accepted = await request(app)
            .get("/v0/skills/workspace-manifest")
            .set("X-Magda-Session", token());

        expect(missing.status).to.equal(401);
        expect(invalid.status).to.equal(401);
        expect(accepted.status).to.equal(200);
        expect(accepted.headers["cache-control"]).to.equal("private, no-store");
        expect(manifestCalls).to.equal(1);
    });

    it("rejects every workspace manifest query parameter before service dispatch", async () => {
        let manifestCalls = 0;
        const service = ({
            getWorkspaceSkillManifest: async () => {
                manifestCalls += 1;
                throw new Error("must not run");
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);

        for (const query of ["limit=1", "pageToken=opaque", "q=skill"]) {
            const response = await request(app)
                .get(`/v0/skills/workspace-manifest?${query}`)
                .set("X-Magda-Session", token());
            expect(response.status).to.equal(400);
            expect(response.body.error.code).to.equal(
                "INVALID_WORKSPACE_MANIFEST_QUERY"
            );
        }
        expect(manifestCalls).to.equal(0);
    });

    it("reports workspace manifest downstream outages as retryable", async () => {
        const service = ({
            getWorkspaceSkillManifest: async () => {
                throw new DownstreamServiceError(
                    "registry",
                    503,
                    "Registry API is unavailable"
                );
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);

        const response = await request(app)
            .get("/v0/skills/workspace-manifest")
            .set("X-Magda-Session", token());

        expect(response.status).to.equal(503);
        expect(response.body.error).to.deep.equal({
            code: "REGISTRY_ERROR",
            message: "Registry API is unavailable",
            retryable: true
        });
    });

    it("passes one strong quoted If-Match checksum to replace and delete", async () => {
        const expectedChecksums: Array<string | undefined> = [];
        const record = skillRecord();
        const service = ({
            prepareExisting: async () => record,
            replaceAuthorized: async (
                _existing: AgentSkillRecord,
                _bytes: Buffer,
                _user: unknown,
                expectedChecksum?: string
            ) => {
                expectedChecksums.push(expectedChecksum);
                return metadata;
            },
            deleteAuthorized: async (
                _existing: AgentSkillRecord,
                _user: unknown,
                expectedChecksum?: string
            ) => {
                expectedChecksums.push(expectedChecksum);
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);
        const quoted = `"${metadata.checksum}"`;

        const replaced = await request(app)
            .put(`/v0/skills/user/${recordId}/archive`)
            .set("X-Magda-Session", token())
            .set("Content-Type", "application/zip")
            .set("If-Match", quoted)
            .send(Buffer.from("zip"));
        const deleted = await request(app)
            .delete(`/v0/skills/user/${recordId}`)
            .set("X-Magda-Session", token())
            .set("If-Match", quoted);

        expect(replaced.status).to.equal(200);
        expect(deleted.status).to.equal(204);
        expect(expectedChecksums).to.deep.equal([
            metadata.checksum,
            metadata.checksum
        ]);
    });

    it("returns 412 for stale replace and delete If-Match checksums", async () => {
        const staleChecksum = "f".repeat(64);
        const record = skillRecord();
        const stale = () =>
            new AgentSkillError(
                "Agent Skill changed since it was last read",
                412,
                "AGENT_SKILL_PRECONDITION_FAILED"
            );
        const service = ({
            prepareExisting: async () => record,
            replaceAuthorized: async (
                _existing: AgentSkillRecord,
                _bytes: Buffer,
                _user: unknown,
                expectedChecksum?: string
            ) => {
                expect(expectedChecksum).to.equal(staleChecksum);
                throw stale();
            },
            deleteAuthorized: async (
                _existing: AgentSkillRecord,
                _user: unknown,
                expectedChecksum?: string
            ) => {
                expect(expectedChecksum).to.equal(staleChecksum);
                throw stale();
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);
        const quoted = `"${staleChecksum}"`;

        const replaced = await request(app)
            .put(`/v0/skills/user/${recordId}/archive`)
            .set("X-Magda-Session", token())
            .set("Content-Type", "application/zip")
            .set("If-Match", quoted)
            .send(Buffer.from("zip"));
        const deleted = await request(app)
            .delete(`/v0/skills/user/${recordId}`)
            .set("X-Magda-Session", token())
            .set("If-Match", quoted);

        for (const response of [replaced, deleted]) {
            expect(response.status).to.equal(412);
            expect(response.body.error.code).to.equal(
                "AGENT_SKILL_PRECONDITION_FAILED"
            );
        }
    });

    it("requires If-Match for replacement and deletion", async () => {
        let mutationCalls = 0;
        const service = ({
            prepareExisting: async () => skillRecord(),
            replaceAuthorized: async () => {
                mutationCalls += 1;
                return metadata;
            },
            deleteAuthorized: async () => {
                mutationCalls += 1;
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);
        const replaced = await request(app)
            .put(`/v0/skills/user/${recordId}/archive`)
            .set("X-Magda-Session", token())
            .set("Content-Type", "application/zip")
            .send(Buffer.from("zip"));
        const deleted = await request(app)
            .delete(`/v0/skills/user/${recordId}`)
            .set("X-Magda-Session", token());
        for (const response of [replaced, deleted]) {
            expect(response.status).to.equal(428);
            expect(response.body.error.code).to.equal(
                "AGENT_SKILL_PRECONDITION_REQUIRED"
            );
        }
        expect(mutationCalls).to.equal(0);
    });

    it("rejects invalid If-Match syntax before replace or delete mutation", async () => {
        let mutationCalls = 0;
        const record = skillRecord();
        const service = ({
            prepareExisting: async () => record,
            replaceAuthorized: async () => {
                mutationCalls += 1;
                return metadata;
            },
            deleteAuthorized: async () => {
                mutationCalls += 1;
            }
        } as unknown) as AgentSkillService;
        const app = buildApp(config(), {} as AgentManager, service);
        const invalidValues = [
            metadata.checksum,
            `W/"${metadata.checksum}"`,
            "*",
            `"${"A".repeat(64)}"`,
            `"${metadata.checksum}", "${metadata.checksum}"`
        ];

        for (const value of invalidValues) {
            const replaced = await request(app)
                .put(`/v0/skills/user/${recordId}/archive`)
                .set("X-Magda-Session", token())
                .set("Content-Type", "application/zip")
                .set("If-Match", value)
                .send(Buffer.from("zip"));
            const deleted = await request(app)
                .delete(`/v0/skills/user/${recordId}`)
                .set("X-Magda-Session", token())
                .set("If-Match", value);
            for (const response of [replaced, deleted]) {
                expect(response.status).to.equal(400);
                expect(response.body.error.code).to.equal("INVALID_IF_MATCH");
            }
        }
        expect(mutationCalls).to.equal(0);
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

    it("keeps lifecycle endpoints closed to users without agentWorkspace/access", async () => {
        const app = buildApp(config(), {} as AgentManager);
        const response = await request(app)
            .get("/v0/session")
            .set("X-Magda-Session", token());
        expect(response.status).to.equal(403);
    });
});
