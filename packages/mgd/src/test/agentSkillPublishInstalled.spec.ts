import { expect } from "chai";
import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { registerAgentSkillCommands } from "../commands/agentSkill.js";
import {
    AGENT_SKILL_INSTALL_MARKER,
    sha256Hex,
    validateAgentSkillArchive
} from "../agentSkillArchive.js";
import {
    installationKey,
    loadAgentSkillInstallationIndex
} from "../agentSkillLocalState.js";
import { saveConfig } from "../profile.js";
import { UsageError } from "../errors.js";
import { captureStdout } from "./captureStdout.js";
import { startMockServer } from "./mockServer.js";
import {
    FakeAgentSkillRemote,
    HarnessEnvironment,
    createHarnessEnvironment,
    pathExists,
    readMarker,
    readSkill,
    skillMarkdown
} from "./agentSkillFixtures.js";

async function run(argv: string[]): Promise<string> {
    const program = new Command();
    program.exitOverride();
    registerAgentSkillCommands(program);
    return captureStdout(() => program.parseAsync(argv, { from: "user" }));
}

describe("publishing and deleting installed Agent Skill copies", () => {
    let env: HarnessEnvironment;
    let remote: FakeAgentSkillRemote;
    let server: Awaited<ReturnType<typeof startMockServer>>;
    let rejectNextPut = false;
    const dir = (harness: keyof HarnessEnvironment["roots"]) =>
        path.join(env.roots[harness], "alpha");

    beforeEach(async () => {
        env = await createHarnessEnvironment("mgd-publish-installed-");
        remote = new FakeAgentSkillRemote("", path.join(env.tmp, "remote"));
        rejectNextPut = false;
        server = await startMockServer([
            ...remote.routes(),
            {
                method: "PUT",
                path: /\/archive$/,
                handler: (req, res, recorded) => {
                    void (async () => {
                        const id = (req.url || "").split("/").slice(-2)[0];
                        const current = remote.items.get(id)!;
                        if (
                            rejectNextPut ||
                            req.headers["if-match"] !==
                                `"${current.meta.checksum}"`
                        ) {
                            rejectNextPut = false;
                            res.writeHead(412, {
                                "content-type": "application/json"
                            });
                            res.end("{}");
                            return;
                        }
                        // The real service rejects a ZIP carrying the marker.
                        await validateAgentSkillArchive(recorded.body, "user");
                        const meta = {
                            ...current.meta,
                            checksum: sha256Hex(recorded.body)
                        };
                        remote.items.set(id, { meta, bytes: recorded.body });
                        res.writeHead(200, {
                            "content-type": "application/json"
                        });
                        res.end(JSON.stringify(meta));
                    })().catch((error) => {
                        res.writeHead(400, {
                            "content-type": "application/json"
                        });
                        res.end(JSON.stringify({ message: String(error) }));
                    });
                }
            },
            {
                method: "DELETE",
                path: /^\/api\/v0\/agent\/skills\/user\/[^/]+$/,
                handler: (req, res) => {
                    const id = (req.url || "").split("/").pop()!;
                    remote.items.delete(id);
                    res.writeHead(204);
                    res.end();
                }
            }
        ]);
        remote.baseUrl = `${server.url}/api`;
        await saveConfig({
            activeProfile: "default",
            profiles: { default: { baseUrl: remote.baseUrl } }
        });
        await remote.publish("alpha", "v1");
        const synced = JSON.parse(await run(["agent-skill", "sync", "--json"]));
        expect(synced.status).to.equal("success");
        expect(synced.counts.installed).to.equal(4);
    });

    afterEach(async () => {
        await server.close();
        await env.restore();
    });

    it("publishes an owned installed copy and updates only its own baseline", async () => {
        const original = await readMarker(dir("claude"));
        await fs.writeFile(
            path.join(dir("claude"), "SKILL.md"),
            skillMarkdown("alpha", "improved in Claude")
        );

        const published = JSON.parse(
            await run(["agent-skill", "publish", dir("claude"), "--json"])
        );
        const put = server.requests.find((r) => r.method === "PUT")!;
        expect(put.headers["if-match"]).to.equal(
            `"${original.baselineChecksum}"`
        );
        const sent = await validateAgentSkillArchive(put.body, "user");
        expect(sent.entries).to.deep.equal(["SKILL.md"]);
        expect(published.installation).to.deep.include({
            harness: "claude",
            baselineUpdated: true
        });

        const claude = await readMarker(dir("claude"));
        expect(claude.installationId).to.equal(original.installationId);
        expect(claude.baselineChecksum).to.equal(published.checksum);
        // Other harnesses are not synchronized implicitly after publish.
        const codex = await readMarker(dir("codex"));
        expect(codex.baselineChecksum).to.equal(original.baselineChecksum);
        expect(await readSkill(dir("codex"))).to.equal(
            skillMarkdown("alpha", "v1")
        );

        // A later ordinary sync updates the older clean copies only.
        const synced = JSON.parse(await run(["agent-skill", "sync", "--json"]));
        expect(synced.status).to.equal("success");
        expect(synced.counts).to.deep.include({ updated: 3, unchanged: 1 });
        for (const harness of ["codex", "opencode", "dsh"] as const)
            expect(await readSkill(dir(harness))).to.equal(
                skillMarkdown("alpha", "improved in Claude")
            );
    });

    it("keeps an independently edited sibling copy as a conflict after publish", async () => {
        await fs.writeFile(
            path.join(dir("claude"), "SKILL.md"),
            skillMarkdown("alpha", "claude edit")
        );
        await fs.writeFile(
            path.join(dir("codex"), "SKILL.md"),
            skillMarkdown("alpha", "codex edit")
        );
        await run(["agent-skill", "publish", dir("claude"), "--json"]);
        const previous = process.exitCode;
        try {
            const synced = JSON.parse(
                await run(["agent-skill", "sync", "--json"])
            );
            expect(synced.blocked).to.equal(true);
            expect(
                synced.conflicts.map((c: any) => [c.harness, c.reason])
            ).to.deep.equal([["codex", "LOCAL_MODIFICATION"]]);
            expect(process.exitCode).to.equal(1);
        } finally {
            process.exitCode = previous;
        }
    });

    it("fails on a stale remote publication unless --force is explicit", async () => {
        await fs.writeFile(
            path.join(dir("claude"), "SKILL.md"),
            skillMarkdown("alpha", "edit")
        );
        rejectNextPut = true;
        let caught: unknown;
        try {
            await run(["agent-skill", "publish", dir("claude")]);
        } catch (error) {
            caught = error;
        }
        expect(caught).to.be.instanceOf(UsageError);
        expect((caught as Error).message).to.include("--force");

        await run([
            "agent-skill",
            "publish",
            dir("claude"),
            "--force",
            "--json"
        ]);
        const puts = server.requests.filter((r) => r.method === "PUT");
        expect(puts).to.have.length(2);
    });

    it("refuses a directory whose metadata does not match the installation index", async () => {
        const copy = path.join(env.tmp, "copied-skill");
        await fs.cp(dir("claude"), copy, { recursive: true });
        let caught: unknown;
        try {
            await run(["agent-skill", "publish", copy]);
        } catch (error) {
            caught = error;
        }
        expect(caught).to.be.instanceOf(UsageError);
        expect((caught as Error).message).to.include(
            AGENT_SKILL_INSTALL_MARKER
        );
        expect(server.requests.some((r) => r.method === "PUT")).to.equal(false);
    });

    it("delete retires clean copies and keeps a modified one as a conflict", async () => {
        await fs.writeFile(
            path.join(dir("opencode"), "SKILL.md"),
            skillMarkdown("alpha", "opencode edit")
        );
        const id = remote.idFor("alpha");
        const result = JSON.parse(
            await run(["agent-skill", "delete", `user/${id}`, "--json"])
        );
        expect(result.deleted).to.equal(true);
        expect(result.local.blocked).to.equal(true);
        expect(
            result.local.conflicts.map((c: any) => [c.harness, c.reason])
        ).to.deep.equal([["opencode", "REMOVED_REMOTE_LOCAL_MODIFICATION"]]);
        for (const harness of ["claude", "codex", "opencode", "dsh"] as const)
            expect(await pathExists(dir(harness))).to.equal(true);

        const forced = JSON.parse(
            await run(["agent-skill", "sync", "--force", "--json"])
        );
        expect(forced.counts.removed).to.equal(4);
        expect(await pathExists(dir("opencode"))).to.equal(false);
        expect(
            (await loadAgentSkillInstallationIndex()).installations[
                installationKey(env.roots.opencode, "alpha")
            ]
        ).to.equal(undefined);
    });
});
