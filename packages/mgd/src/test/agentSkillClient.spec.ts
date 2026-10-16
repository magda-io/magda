import { expect } from "chai";
import { AgentSkillClient } from "../agentSkillClient.js";
import { MagdaClient } from "../client.js";
import {
    AGENT_SKILLS,
    AGENT_SKILL_LOCAL_SYNC_MANIFEST,
    AGENT_SKILL_WORKSPACE_MANIFEST,
    agentSkill,
    agentSkillArchive
} from "../endpoints.js";
import { startMockServer } from "./mockServer.js";

const checksum = "a".repeat(64);
const userId = "00000000-0000-4000-8000-000000000123";
const skillId = `agent-skill-${userId}-useful-skill`;
const metadata = {
    id: skillId,
    name: "useful-skill",
    description: "Useful",
    type: "user" as const,
    userId,
    ownerId: userId,
    createdAt: "2025-01-01T00:00:00.000Z",
    createdBy: "u1",
    updatedAt: "2025-01-01T00:00:00.000Z",
    updatedBy: "u1",
    checksum
};

describe("AgentSkillClient caller-auth contracts", () => {
    it("builds caller-auth gateway URLs and validates list/show responses", async () => {
        const encoded = skillId;
        const server = await startMockServer([
            {
                method: "GET",
                path: `/api${AGENT_SKILLS}`,
                body: {
                    items: [metadata],
                    hasMore: true,
                    nextPageToken: "next"
                }
            },
            {
                method: "GET",
                path: `/api${AGENT_SKILLS}/user/${encoded}`,
                body: metadata
            },
            {
                method: "GET",
                path: `/api${AGENT_SKILL_WORKSPACE_MANIFEST}`,
                body: {
                    version: 1,
                    complete: true,
                    items: [
                        {
                            selectionId: skillId,
                            effectiveName: metadata.name,
                            sourceKind: "own-user-publication",
                            source: metadata
                        }
                    ],
                    warnings: []
                }
            },
            {
                method: "GET",
                path: `/api${AGENT_SKILL_LOCAL_SYNC_MANIFEST}`,
                body: {
                    version: 1,
                    complete: true,
                    identity: { tenantId: "0", userId },
                    items: [
                        {
                            selectionId: skillId,
                            effectiveName: metadata.name,
                            sourceKind: "own-user-publication",
                            source: metadata
                        }
                    ],
                    warnings: [],
                    sources: {
                        user: { status: "complete" },
                        installations: { status: "notImplemented" }
                    }
                }
            }
        ]);
        try {
            const client = new AgentSkillClient(
                new MagdaClient({ baseUrl: `${server.url}/api` })
            );
            const page = await client.list({
                type: "user",
                limit: 5,
                pageToken: "a token",
                q: "useful"
            });
            expect(page.items).to.deep.equal([metadata]);
            expect(page.nextPageToken).to.equal("next");
            expect(
                await client.show({ type: "user", id: metadata.id })
            ).to.deep.equal(metadata);
            expect((await client.manifest()).items[0].source).to.deep.equal(
                metadata
            );
            expect((await client.localManifest()).identity).to.deep.equal({
                tenantId: "0",
                userId
            });

            const listUrl = new URL(server.requests[0].url, server.url);
            expect(listUrl.pathname).to.equal(`/api${AGENT_SKILLS}`);
            expect(Object.fromEntries(listUrl.searchParams)).to.deep.equal({
                type: "user",
                limit: "5",
                pageToken: "a token",
                q: "useful"
            });
            expect(server.requests[1].url).to.equal(
                `/api${agentSkill("user", metadata.id)}`
            );
            expect(server.requests[2].url).to.equal(
                `/api${AGENT_SKILL_WORKSPACE_MANIFEST}`
            );
            expect(server.requests[3].url).to.equal(
                `/api${AGENT_SKILL_LOCAL_SYNC_MANIFEST}`
            );
        } finally {
            await server.close();
        }
    });

    it("uses ZIP bodies and strong If-Match for create, replace, and delete", async () => {
        const created = { ...metadata };
        const replaced = { ...metadata, checksum: "b".repeat(64) };
        const server = await startMockServer([
            { method: "POST", path: `/api${AGENT_SKILLS}/user`, body: created },
            {
                method: "PUT",
                path: `/api${agentSkillArchive("user", skillId)}`,
                body: replaced
            },
            {
                method: "DELETE",
                path: `/api${agentSkill("user", skillId)}`,
                body: {}
            }
        ]);
        try {
            const client = new AgentSkillClient(
                new MagdaClient({ baseUrl: `${server.url}/api` })
            );
            const bytes = Buffer.from("PK test");
            expect((await client.create("user", bytes)).id).to.equal(skillId);
            expect(
                (
                    await client.replace(
                        { type: "user", id: skillId },
                        bytes,
                        checksum
                    )
                ).checksum
            ).to.equal("b".repeat(64));
            await client.delete(
                { type: "user", id: skillId },
                replaced.checksum
            );

            expect(
                server.requests.map((request) => request.url)
            ).to.deep.equal([
                `/api${AGENT_SKILLS}/user`,
                `/api${agentSkillArchive("user", skillId)}`,
                `/api${agentSkill("user", skillId)}`
            ]);
            expect(server.requests[0].headers["content-type"]).to.equal(
                "application/zip"
            );
            expect(server.requests[0].body.equals(bytes)).to.equal(true);
            expect(server.requests[1].headers["if-match"]).to.equal(
                `"${checksum}"`
            );
            expect(server.requests[2].headers["if-match"]).to.equal(
                `"${replaced.checksum}"`
            );
        } finally {
            await server.close();
        }
    });
});
