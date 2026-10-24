import { expect } from "chai";
import { Command } from "commander";
import { registerAgentSkillCommands } from "../commands/agentSkill.js";
import { UsageError } from "../errors.js";
import { saveConfig } from "../profile.js";
import { captureStdout } from "./captureStdout.js";
import {
    HarnessEnvironment,
    USER_ID,
    createHarnessEnvironment
} from "./agentSkillFixtures.js";
import { startMockServer } from "./mockServer.js";

const SOURCE = "agent-skill-00000000-0000-4000-8000-0000000000a1-csv-reporter";
const INSTALLATION = `agent-skill-${USER_ID}-team-csv`;

const installation = {
    id: INSTALLATION,
    effectiveName: "team-csv",
    alias: "team-csv",
    userId: USER_ID,
    sourceSkillId: SOURCE,
    createdAt: "2026-10-21T00:00:00Z",
    source: { status: "unavailable" }
};

async function run(argv: string[]): Promise<string> {
    const program = new Command();
    program.exitOverride();
    registerAgentSkillCommands(program);
    const previous = process.exitCode;
    try {
        return await captureStdout(() =>
            program.parseAsync(argv, { from: "user" })
        );
    } finally {
        process.exitCode = previous;
    }
}

describe("agent-skill sharing commands (#3861)", () => {
    let env: HarnessEnvironment;
    let server: Awaited<ReturnType<typeof startMockServer>>;
    let installReply: { status: number; body: unknown };

    const json = (status: number, body: unknown) => (
        _req: unknown,
        res: any
    ) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
    };

    beforeEach(async () => {
        env = await createHarnessEnvironment("mgd-share-cmd-");
        installReply = { status: 201, body: installation };
        server = await startMockServer([
            {
                method: "GET",
                path: "/api/v0/agent/skills",
                handler: json(200, { items: [], hasMore: false })
            },
            {
                method: "GET",
                path: "/api/v0/agent/skills/installations",
                handler: json(200, {
                    items: [installation],
                    hasMore: false
                })
            },
            {
                method: "POST",
                path: "/api/v0/agent/skills/installations",
                handler: (req, res) =>
                    json(installReply.status, installReply.body)(req, res)
            },
            {
                method: "DELETE",
                path: /^\/api\/v0\/agent\/skills\/installations\/[^/]+$/,
                status: 204,
                handler: (_req, res) => {
                    res.writeHead(204);
                    res.end();
                }
            },
            {
                method: "PUT",
                path: /\/access\/users\/[^/]+$/,
                handler: json(200, { added: true })
            },
            {
                method: "DELETE",
                path: /\/access\/users\/[^/]+$/,
                handler: json(200, { removed: true })
            },
            {
                method: "GET",
                path: /\/access\/users$/,
                handler: json(200, {
                    items: [{ id: USER_ID, displayName: "Bob" }],
                    total: 1
                })
            },
            {
                method: "PUT",
                path: /\/access$/,
                handler: json(200, {
                    id: "agent-skill-system-report",
                    type: "system",
                    public: false,
                    recipients: { count: 0 }
                })
            }
        ]);
        await saveConfig({
            activeProfile: "dev",
            profiles: {
                dev: {
                    baseUrl: `${server.url}/api`,
                    apiKeyId: "k",
                    apiKey: "s"
                }
            }
        });
    });

    afterEach(async () => {
        await server.close();
        await env.restore();
    });

    const lastRequest = () => server.requests[server.requests.length - 1];

    it("lists shared skills with the other-users filter", async () => {
        await run(["agent-skill", "list", "--shared", "--json"]);
        const url = new URL(lastRequest().url, server.url);
        expect(url.searchParams.get("type")).to.equal("user");
        expect(url.searchParams.get("userId")).to.equal("!current");
        let error: unknown;
        try {
            await run(["agent-skill", "list", "--shared", "--type", "system"]);
        } catch (caught) {
            error = caught;
        }
        expect(error).to.be.instanceOf(UsageError);
    });

    it("installs by publication ID with an alias and never sends a recipient", async () => {
        const output = await run([
            "agent-skill",
            "install",
            `user/${SOURCE}`,
            "--as",
            "team-csv",
            "--json"
        ]);
        expect(JSON.parse(lastRequest().body.toString())).to.deep.equal({
            sourceSkillId: SOURCE,
            alias: "team-csv"
        });
        expect(JSON.parse(output).id).to.equal(INSTALLATION);
    });

    it("turns a name conflict into an alias suggestion", async () => {
        installReply = {
            status: 409,
            body: {
                error: {
                    code: "AGENT_SKILL_NAME_CONFLICT",
                    message: "The name is already used.",
                    details: {
                        conflict: "publication",
                        suggestedAlias: "csv-reporter-2"
                    }
                }
            }
        };
        let error: Error | undefined;
        try {
            await run(["agent-skill", "install", SOURCE]);
        } catch (caught) {
            error = caught as Error;
        }
        expect(error).to.be.instanceOf(UsageError);
        expect(error!.message).to.include("--as csv-reporter-2");
    });

    it("refuses to install system skills", async () => {
        let error: unknown;
        try {
            await run([
                "agent-skill",
                "install",
                "system/agent-skill-system-x"
            ]);
        } catch (caught) {
            error = caught;
        }
        expect(error).to.be.instanceOf(UsageError);
        expect(server.requests).to.deep.equal([]);
    });

    it("uninstalls by installed name", async () => {
        await run(["agent-skill", "uninstall", "team-csv", "--json"]);
        expect(lastRequest()).to.deep.include({
            method: "DELETE",
            url: `/api/v0/agent/skills/installations/${INSTALLATION}`
        });
    });

    it("shares, unshares and lists recipients of one publication", async () => {
        const ref = `user/agent-skill-${USER_ID}-own`;
        await run([
            "agent-skill",
            "share",
            ref,
            "00000000-0000-4000-8000-0000000000b0",
            "--json"
        ]);
        expect(lastRequest()).to.deep.include({
            method: "PUT",
            url: `/api/v0/agent/skills/user/agent-skill-${USER_ID}-own/access/users/00000000-0000-4000-8000-0000000000b0`
        });
        await run([
            "agent-skill",
            "unshare",
            ref,
            "00000000-0000-4000-8000-0000000000b0"
        ]);
        expect(lastRequest().method).to.equal("DELETE");
        const output = await run([
            "agent-skill",
            "recipients",
            ref,
            "--keyword",
            "bo",
            "--json"
        ]);
        expect(JSON.parse(output).total).to.equal(1);
        expect(
            new URL(lastRequest().url, server.url).searchParams.get("keyword")
        ).to.equal("bo");
    });

    it("maps system access flags to settings", async () => {
        await run([
            "agent-skill",
            "access",
            "system/agent-skill-system-report",
            "--no-public",
            "--clear-org-unit",
            "--json"
        ]);
        expect(JSON.parse(lastRequest().body.toString())).to.deep.equal({
            public: false,
            orgUnitId: null
        });
    });
});
