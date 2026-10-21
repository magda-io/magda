import { expect } from "chai";
import jwt from "jsonwebtoken";
import request from "supertest";
import { AgentManager } from "../manager.js";
import buildApp from "../buildApp.js";
import {
    HttpAgentSkillRegistry,
    HttpAgentSkillShareGroups,
    OpaAgentSkillAuthorization
} from "../skills/clients.js";
import { AgentSkillError, AgentSkillService } from "../skills/service.js";
import { ManagerConfig } from "../types.js";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import { UnconditionalTrueDecision } from "magda-typescript-common/src/opa/AuthDecision.js";

const jwtSecret = "sharing-api-secret";
const userId = "00000000-0000-4000-8000-000000000123";
const sourceId = "agent-skill-00000000-0000-4000-8000-000000000456-csv";

function config(): ManagerConfig {
    return ({
        jwtSecret,
        authApiUrl: "http://authorization-api/v0",
        skillArchiveMaxCompressedBytes: 1024
    } as unknown) as ManagerConfig;
}

function token(id = userId): string {
    return jwt.sign({ userId: id }, jwtSecret, { algorithm: "HS256" });
}

describe("Agent Skill sharing API (#3861)", () => {
    let originalFetch: typeof globalThis.fetch;
    let calls: Array<{ name: string; args: unknown[] }>;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
        calls = [];
        // whoami for the authenticated caller
        globalThis.fetch = (async () =>
            new Response(JSON.stringify({ id: userId, roles: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            })) as typeof globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    function app(overrides: Record<string, unknown> = {}) {
        const record = (name: string) => async (...args: unknown[]) => {
            calls.push({ name, args });
            if (overrides[name]) return (overrides[name] as Function)(...args);
            return {};
        };
        const service = ({
            prepareCreate: record("prepareCreate"),
            installations: {
                list: record("list"),
                install: async (...args: unknown[]) => {
                    calls.push({ name: "install", args });
                    return (
                        (overrides.install as Function)?.(...args) || {
                            created: true,
                            installation: { id: `agent-skill-${userId}-csv` }
                        }
                    );
                },
                get: record("get"),
                uninstall: record("uninstall"),
                fork: async (...args: unknown[]) => {
                    calls.push({ name: "fork", args });
                    return {
                        publication: { id: `agent-skill-${userId}-csv` },
                        installationRemoved: true
                    };
                }
            },
            access: {
                getAccess: record("getAccess"),
                updateSystemAccess: record("updateSystemAccess"),
                listRecipients: record("listRecipients"),
                addRecipient: record("addRecipient"),
                removeRecipient: record("removeRecipient")
            }
        } as unknown) as AgentSkillService;
        return buildApp(config(), {} as AgentManager, service);
    }

    it("requires authentication for every sharing route", async () => {
        const server = app();
        for (const [method, path] of [
            ["get", "/v0/skills/installations"],
            ["post", "/v0/skills/installations"],
            ["delete", `/v0/skills/installations/agent-skill-${userId}-csv`],
            ["get", `/v0/skills/user/${sourceId}/access`],
            ["put", `/v0/skills/user/${sourceId}/access/users/${userId}`]
        ] as const) {
            const response = await (request(server) as any)[method](path);
            expect(response.status, path).to.equal(401);
        }
        expect(calls).to.deep.equal([]);
    });

    it("derives the recipient from authentication and rejects caller-selected identity", async () => {
        const server = app();
        for (const body of [
            { sourceSkillId: sourceId, userId: "someone-else" },
            { sourceSkillId: sourceId, ownerId: userId },
            { sourceSkillId: sourceId, id: "agent-skill-x" },
            [sourceId],
            "text"
        ]) {
            const response = await request(server)
                .post("/v0/skills/installations")
                .set("X-Magda-Session", token())
                .send(body as object);
            expect(response.status, JSON.stringify(body)).to.equal(400);
        }
        expect(calls).to.deep.equal([]);

        const created = await request(server)
            .post("/v0/skills/installations")
            .set("X-Magda-Session", token())
            .send({ sourceSkillId: sourceId, alias: "team-csv" });
        expect(created.status).to.equal(201);
        expect(created.headers.location).to.equal(
            `/api/v0/agent/skills/installations/agent-skill-${userId}-csv`
        );
        expect(calls[0].args[0]).to.deep.equal({
            sourceSkillId: sourceId,
            alias: "team-csv"
        });
        expect((calls[0].args[1] as { id: string }).id).to.equal(userId);
    });

    it("returns 200 for an idempotent install and 400 for invalid JSON", async () => {
        const server = app({
            install: () => ({
                created: false,
                installation: { id: `agent-skill-${userId}-csv` }
            })
        });
        const repeated = await request(server)
            .post("/v0/skills/installations")
            .set("X-Magda-Session", token())
            .send({ sourceSkillId: sourceId });
        expect(repeated.status).to.equal(200);
        const invalid = await request(server)
            .post("/v0/skills/installations")
            .set("X-Magda-Session", token())
            .set("Content-Type", "application/json")
            .send("{not json");
        expect(invalid.status).to.equal(400);
        expect(invalid.body.error.code).to.equal("INVALID_JSON");
    });

    it("returns structured conflict details for alias prompts", async () => {
        const server = app({
            install: () => {
                throw new AgentSkillError(
                    "Name in use",
                    409,
                    "AGENT_SKILL_NAME_CONFLICT",
                    false,
                    `agent-skill-${userId}-csv`,
                    { conflict: "publication", suggestedAlias: "csv-2" }
                );
            }
        });
        const response = await request(server)
            .post("/v0/skills/installations")
            .set("X-Magda-Session", token())
            .send({ sourceSkillId: sourceId });
        expect(response.status).to.equal(409);
        expect(response.body.error).to.deep.include({
            code: "AGENT_SKILL_NAME_CONFLICT",
            details: { conflict: "publication", suggestedAlias: "csv-2" }
        });
    });

    it("validates pagination and access bodies", async () => {
        const server = app();
        const badLimit = await request(server)
            .get("/v0/skills/installations?limit=0")
            .set("X-Magda-Session", token());
        expect(badLimit.status).to.equal(400);
        const badBody = await request(server)
            .put("/v0/skills/system/agent-skill-system-x/access")
            .set("X-Magda-Session", token())
            .send({ public: false, preAuthorisedPermissionIds: ["x"] });
        expect(badBody.status).to.equal(400);
        const badType = await request(server)
            .get("/v0/skills/installation/x/access")
            .set("X-Magda-Session", token());
        expect(badType.status).to.equal(404);
        expect(calls).to.deep.equal([]);

        const users = await request(server)
            .get(
                `/v0/skills/user/${sourceId}/access/users?offset=10&limit=5&keyword=al`
            )
            .set("X-Magda-Session", token());
        expect(users.status).to.equal(200);
        expect(calls[0]).to.deep.include({ name: "listRecipients" });
        expect(calls[0].args.slice(0, 3)).to.deep.equal([
            "user",
            sourceId,
            { offset: 10, limit: 5, keyword: "al" }
        ]);
    });

    it("checks the fork's publish permission before reading the ZIP", async () => {
        const denied = app({
            prepareCreate: () => {
                throw new AgentSkillError(
                    "denied",
                    403,
                    "AGENT_SKILL_FORBIDDEN"
                );
            }
        });
        const response = await request(denied)
            .post(`/v0/skills/installations/agent-skill-${userId}-csv/publish`)
            .set("X-Magda-Session", token())
            .set("Content-Type", "application/zip")
            .send(Buffer.from("zip"));
        expect(response.status).to.equal(403);
        expect(calls.map((call) => call.name)).to.deep.equal(["prepareCreate"]);

        const server = app();
        calls = [];
        const forked = await request(server)
            .post(`/v0/skills/installations/agent-skill-${userId}-csv/publish`)
            .set("X-Magda-Session", token())
            .set("Content-Type", "application/zip")
            .send(Buffer.from("zip"));
        expect(forked.status).to.equal(201);
        expect(forked.body.installationRemoved).to.equal(true);
        expect(calls.map((call) => call.name)).to.deep.equal([
            "prepareCreate",
            "fork"
        ]);
    });
});

describe("Agent Skill sharing downstream clients (#3861)", () => {
    let originalFetch: typeof globalThis.fetch;
    let requests: Array<{ url: string; init?: RequestInit }>;
    let reply: (url: string, init?: RequestInit) => Response;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
        requests = [];
        reply = () =>
            new Response(JSON.stringify({ hasMore: false, records: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
            requests.push({ url: String(url), init });
            return reply(String(url), init);
        }) as typeof globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("queries only the caller's installations with the installation aspect", async () => {
        const registry = new HttpAgentSkillRegistry("http://registry/v0", 3);
        await registry.listInstallations(
            { userId, limit: 50, pageToken: "next" },
            "session"
        );
        const url = new URL(requests[0].url);
        expect(url.pathname).to.equal("/v0/records");
        expect(url.searchParams.getAll("aspect")).to.deep.equal([
            "agent-skill-installation",
            "access-control"
        ]);
        expect(url.searchParams.getAll("aspectQuery")).to.deep.equal([
            `agent-skill-installation.userId:${userId}`
        ]);
        expect(url.searchParams.get("pageToken")).to.equal("next");
        expect(url.searchParams.has("orderBy")).to.equal(false);
        expect(
            (requests[0].init?.headers as Record<string, string>)[
                "X-Magda-Tenant-Id"
            ]
        ).to.equal("3");
    });

    it("classifies what occupies a deterministic ID", async () => {
        const registry = new HttpAgentSkillRegistry("http://registry/v0", 0);
        reply = () => new Response("", { status: 404 });
        expect(await registry.occupant("agent-skill-x", "s")).to.equal("none");
        reply = () =>
            new Response(
                JSON.stringify({ aspects: { "agent-skill-installation": {} } }),
                { status: 200 }
            );
        expect(await registry.occupant("agent-skill-x", "s")).to.equal(
            "installation"
        );
        reply = () =>
            new Response(JSON.stringify({ aspects: { "agent-skill": {} } }), {
                status: 200
            });
        expect(await registry.occupant("agent-skill-x", "s")).to.equal(
            "publication"
        );
    });

    it("sends typed installation decisions to OPA", async () => {
        let captured: any;
        let capturedToken: string | undefined;
        const authorization = new OpaAgentSkillAuthorization(({
            getAuthDecision: async (config: unknown, token: string) => {
                captured = config;
                capturedToken = token;
                return UnconditionalTrueDecision;
            }
        } as unknown) as AuthDecisionQueryClient);
        expect(
            await authorization.canInstallation(
                "create",
                {
                    id: `agent-skill-${userId}-csv`,
                    name: "csv",
                    aspects: {
                        "agent-skill-installation": {
                            userId,
                            sourceSkillId: sourceId,
                            createdAt: "2026-10-21T00:00:00Z"
                        },
                        "access-control": { ownerId: userId }
                    }
                },
                "session"
            )
        ).to.equal(true);
        expect(capturedToken).to.equal("session");
        expect(captured).to.deep.include({
            operationUri: "object/agentSkill/install/create",
            unknowns: []
        });
        expect(captured.input.object.agentSkillInstallation).to.deep.include({
            id: `agent-skill-${userId}-csv`,
            "agent-skill-installation": {
                userId,
                sourceSkillId: sourceId,
                createdAt: "2026-10-21T00:00:00Z"
            }
        });
    });

    it("creates system-managed typed share groups and reads only id and display name", async () => {
        const groups = new HttpAgentSkillShareGroups(
            "http://authorization-api/v0",
            "http://registry/v0",
            0
        );
        reply = () =>
            new Response(
                JSON.stringify({
                    id: "group-id",
                    resourceUri: "object/agentSkill/user",
                    operationUris: ["object/agentSkill/user/read"],
                    permissionId: "p",
                    roleId: "r",
                    keywords: ["agent-skill-share"]
                }),
                { status: 200 }
            );
        const created = await groups.create(
            {
                name: "Agent Skill share",
                description: "d",
                resourceUri: "object/agentSkill/user",
                operationUris: ["object/agentSkill/user/read"],
                keywords: ["agent-skill-share", "agent-skill-share-abc"]
            },
            "internal"
        );
        expect(created.id).to.equal("group-id");
        expect(requests[0].url).to.equal(
            "http://authorization-api/v0/public/accessGroups"
        );
        expect(JSON.parse(String(requests[0].init?.body))).to.deep.include({
            ownerId: null,
            orgUnitId: null
        });

        reply = () =>
            new Response(
                JSON.stringify([
                    {
                        id: userId,
                        displayName: "Bob",
                        email: "bob@example.com",
                        source: "internal"
                    }
                ]),
                { status: 200 }
            );
        expect(
            await groups.listUsers(
                "group-id",
                { offset: 0, limit: 10 },
                "internal"
            )
        ).to.deep.equal([{ id: userId, displayName: "Bob" }]);

        reply = () =>
            new Response(JSON.stringify({ hasMore: false, records: [] }), {
                status: 200
            });
        await groups.find("agent-skill-share-abc", "internal");
        const findUrl = new URL(requests[requests.length - 1].url);
        expect(findUrl.searchParams.getAll("aspectQuery")).to.deep.equal([
            "access-group-details.keywords:<|agent-skill-share-abc"
        ]);
        reply = () => new Response("bad user", { status: 400 });
        let error: any;
        try {
            await groups.addUser("group-id", userId, "internal");
        } catch (caught) {
            error = caught;
        }
        expect(error?.status).to.equal(404);
    });
});
