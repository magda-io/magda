import { expect } from "chai";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import { UnconditionalTrueDecision } from "magda-typescript-common/src/opa/AuthDecision.js";
import {
    HttpAgentSkillRegistry,
    HttpAgentSkillStorage,
    OpaAgentSkillAuthorization
} from "../skills/clients.js";
import { AgentSkillRecord } from "../skills/types.js";

const userId = "00000000-0000-4000-8000-000000000123";
const recordId = `agent-skill-${userId}-useful-skill`;
const session = "verified-session";

function record(): AgentSkillRecord {
    return {
        id: recordId,
        name: "useful-skill",
        tenantId: 0,
        aspects: {
            "agent-skill": {
                scope: "user",
                createdAt: "2026-10-13T12:00:00.000Z",
                createdBy: userId,
                description: "Useful",
                archiveKey: `agent-services/skills/user-skills/${userId}/${recordId}.zip`,
                updatedAt: "2026-10-13T12:00:00.000Z",
                updatedBy: userId,
                checksum: "0".repeat(64),
                state: "READY"
            },
            "access-control": { ownerId: userId }
        }
    };
}

describe("Agent Skill downstream clients", () => {
    let originalFetch: typeof globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = originalFetch;
    });
    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    it("uploads through normal Storage API multipart with recordId and exact session", async () => {
        let requestUrl = "";
        let requestInit: RequestInit | undefined;
        globalThis.fetch = (async (url, init) => {
            requestUrl = String(url);
            requestInit = init;
            return new Response(JSON.stringify({ etag: "etag" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }) as typeof globalThis.fetch;
        const storage = new HttpAgentSkillStorage(
            "http://storage-api/v0",
            "magda-datasets"
        );
        const bytes = Buffer.from("zip-bytes");
        await storage.upload(
            record().aspects["agent-skill"].archiveKey,
            recordId,
            bytes,
            session
        );

        expect(requestUrl).to.equal(
            `http://storage-api/v0/upload/magda-datasets/agent-services/skills/user-skills/${userId}?recordId=${recordId}`
        );
        expect(requestInit?.method).to.equal("POST");
        expect(
            (requestInit?.headers as Record<string, string>)["X-Magda-Session"]
        ).to.equal(session);
        expect(requestInit?.headers).not.to.have.property("Authorization");
        expect(requestInit?.headers).not.to.have.property("X-Magda-Api-Key");
        const form = requestInit?.body as FormData;
        const file = form.get("file") as File;
        expect(file.name).to.equal(`${recordId}.zip`);
        expect(file.type).to.equal("application/zip");
        expect(Buffer.from(await file.arrayBuffer()).equals(bytes)).to.equal(
            true
        );
    });

    it("requires a bounded one-byte Storage range response for existence checks", async () => {
        globalThis.fetch = (async () =>
            new Response(Buffer.from("entire-object"), {
                status: 200
            })) as typeof globalThis.fetch;
        const storage = new HttpAgentSkillStorage(
            "http://storage-api/v0",
            "magda-datasets"
        );
        let error: unknown;
        try {
            await storage.exists(
                record().aspects["agent-skill"].archiveKey,
                session
            );
        } catch (caught) {
            error = caught;
        }
        expect((error as Error).message).to.include("invalid range response");

        globalThis.fetch = (async () =>
            new Response(Buffer.from("x"), {
                status: 206,
                headers: { "Content-Range": "bytes 0-0/10" }
            })) as typeof globalThis.fetch;
        expect(
            await storage.exists(
                record().aspects["agent-skill"].archiveKey,
                session
            )
        ).to.equal(true);
    });

    it("treats an already-missing Storage object as an idempotent delete", async () => {
        globalThis.fetch = (async () =>
            new Response(null, { status: 404 })) as typeof globalThis.fetch;
        const storage = new HttpAgentSkillStorage(
            "http://storage-api/v0",
            "magda-datasets"
        );
        await storage.delete(
            record().aspects["agent-skill"].archiveKey,
            session
        );
    });

    it("forwards only verified session and tenant to Registry API", async () => {
        let requestUrl = "";
        let headers: HeadersInit | undefined;
        globalThis.fetch = (async (url, init) => {
            requestUrl = String(url);
            headers = init?.headers;
            return new Response(JSON.stringify(record()), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }) as typeof globalThis.fetch;
        const registry = new HttpAgentSkillRegistry(
            "http://registry-api/v0",
            7
        );
        await registry.get(recordId, session);

        expect(requestUrl).to.include(`/records/${recordId}?`);
        expect(requestUrl).to.include("aspect=agent-skill");
        expect(requestUrl).to.include("aspect=access-control");
        expect(headers).to.deep.include({
            "X-Magda-Session": session,
            "X-Magda-Tenant-Id": "7"
        });
    });

    it("uses Registry-compatible keyset pagination beyond the first page", async () => {
        let requestUrl = "";
        globalThis.fetch = (async (url) => {
            requestUrl = String(url);
            return new Response(
                JSON.stringify({
                    records: [record()],
                    hasMore: true,
                    nextPageToken: "124"
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                }
            );
        }) as typeof globalThis.fetch;
        const registry = new HttpAgentSkillRegistry(
            "http://registry-api/v0",
            7
        );
        const result = await registry.list(
            {
                limit: 2,
                pageToken: "123",
                q: "needle",
                scope: "user",
                state: "READY"
            },
            session
        );

        const query = new URL(requestUrl).searchParams;
        expect(query.getAll("aspect")).to.deep.equal([
            "agent-skill",
            "access-control"
        ]);
        expect(query.getAll("aspectQuery")).to.deep.equal([
            "agent-skill.scope:user",
            "agent-skill.state:READY"
        ]);
        expect(query.get("limit")).to.equal("2");
        expect(query.get("reversePageTokenOrder")).to.equal("true");
        expect(query.get("pageToken")).to.equal("123");
        expect(query.get("q")).to.equal("needle");
        expect(query.has("orderBy")).to.equal(false);
        expect(query.has("orderByDir")).to.equal(false);
        expect(query.has("start")).to.equal(false);
        expect(result.nextPageToken).to.equal("124");
    });

    it("builds OPA input only from the trusted typed record", async () => {
        let capturedConfig: unknown;
        let capturedToken: string | undefined;
        const client = ({
            getAuthDecision: async (config: unknown, token: string) => {
                capturedConfig = config;
                capturedToken = token;
                return UnconditionalTrueDecision;
            }
        } as unknown) as AuthDecisionQueryClient;
        const authorization = new OpaAgentSkillAuthorization(client);
        expect(await authorization.can("update", record(), session)).to.equal(
            true
        );
        expect(capturedToken).to.equal(session);
        expect(capturedConfig).to.deep.include({
            operationUri: "object/agentSkill/update",
            unknowns: []
        });
        const context = capturedConfig as {
            input: { object: { agentSkill: Record<string, unknown> } };
        };
        expect(context.input.object.agentSkill.id).to.equal(recordId);
        expect(context.input.object.agentSkill["agent-skill"]).to.deep.equal(
            record().aspects["agent-skill"]
        );
        expect(context.input.object.agentSkill["access-control"]).to.deep.equal(
            record().aspects["access-control"]
        );
    });
});
