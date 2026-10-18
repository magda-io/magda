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
    agentSkillArchivePath,
    createAgentSkillSourceIdentity,
    loadAgentSkillSourceState
} from "../agentSkillLocalState.js";
import { loadConfig, saveConfig } from "../profile.js";
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
    const previous = process.exitCode;
    try {
        return await captureStdout(() =>
            program.parseAsync(argv, { from: "user" })
        );
    } finally {
        process.exitCode = previous;
    }
}

async function rejects(promise: Promise<unknown>): Promise<Error> {
    try {
        await promise;
    } catch (error) {
        return error as Error;
    }
    throw new Error("expected rejection");
}

/** A mock MAGDA instance serving manifests, downloads, PUT and DELETE. */
async function startInstance(scratch: string) {
    const remote = new FakeAgentSkillRemote("", scratch);
    const state = { rejectNextPut: false };
    const server = await startMockServer([
        ...remote.routes(),
        {
            method: "PUT",
            path: /\/archive$/,
            handler: (req, res, recorded) => {
                void (async () => {
                    const id = (req.url || "").split("/").slice(-2)[0];
                    const current = remote.items.get(id);
                    if (!current) {
                        res.writeHead(404, {
                            "content-type": "application/json"
                        });
                        res.end("{}");
                        return;
                    }
                    if (
                        state.rejectNextPut ||
                        req.headers["if-match"] !== `"${current.meta.checksum}"`
                    ) {
                        state.rejectNextPut = false;
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
                    res.writeHead(200, { "content-type": "application/json" });
                    res.end(JSON.stringify(meta));
                })().catch((error) => {
                    res.writeHead(400, { "content-type": "application/json" });
                    res.end(JSON.stringify({ message: String(error) }));
                });
            }
        },
        {
            method: "POST",
            path: "/api/v0/agent/skills/user",
            handler: (_req, res, recorded) => {
                void (async () => {
                    const validated = await validateAgentSkillArchive(
                        recorded.body,
                        "user"
                    );
                    const id = remote.idFor(validated.name);
                    const meta = {
                        id,
                        name: validated.name,
                        description: validated.description,
                        type: "user" as const,
                        userId: remote.userId,
                        ownerId: remote.userId,
                        createdAt: "2025-01-01T00:00:00.000Z",
                        createdBy: remote.userId,
                        updatedAt: "2025-01-01T00:00:00.000Z",
                        updatedBy: remote.userId,
                        checksum: sha256Hex(recorded.body)
                    };
                    remote.items.set(id, { meta, bytes: recorded.body });
                    res.writeHead(201, { "content-type": "application/json" });
                    res.end(JSON.stringify(meta));
                })().catch((error) => {
                    res.writeHead(400, { "content-type": "application/json" });
                    res.end(JSON.stringify({ message: String(error) }));
                });
            }
        },
        {
            method: "DELETE",
            path: /^\/api\/v0\/agent\/skills\/user\/[^/]+$/,
            handler: (req, res) => {
                remote.items.delete((req.url || "").split("/").pop()!);
                res.writeHead(204);
                res.end();
            }
        }
    ]);
    remote.baseUrl = `${server.url}/api`;
    const puts = () => server.requests.filter((r) => r.method === "PUT");
    return { remote, server, state, puts };
}

describe("publishing and deleting installed Agent Skill copies", () => {
    let env: HarnessEnvironment;
    let dev: Awaited<ReturnType<typeof startInstance>>;
    const dir = (harness: keyof HarnessEnvironment["roots"]) =>
        path.join(env.roots[harness], "alpha");

    beforeEach(async () => {
        env = await createHarnessEnvironment("mgd-publish-installed-");
        dev = await startInstance(path.join(env.tmp, "dev"));
        await saveConfig({
            activeProfile: "dev",
            profiles: { dev: { baseUrl: dev.remote.baseUrl } }
        });
        await dev.remote.publish("alpha", "v1");
        const synced = JSON.parse(await run(["agent-skill", "sync", "--json"]));
        expect(synced.status).to.equal("success");
        expect(synced.counts.installed).to.equal(4);
    });

    afterEach(async () => {
        await dev.server.close();
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
        const [put] = dev.puts();
        expect(put.headers["if-match"]).to.equal(
            `"${original.baselineChecksum}"`
        );
        const sent = await validateAgentSkillArchive(put.body, "user");
        expect(sent.entries).to.deep.equal(["SKILL.md"]);
        expect(published.installation).to.deep.include({
            sourceProfile: "dev",
            baselineUpdated: true
        });
        const claude = await readMarker(dir("claude"));
        expect(claude.installationId).to.equal(original.installationId);
        expect(claude.baselineChecksum).to.equal(published.checksum);
        // Other harnesses are not synchronized implicitly after publish.
        expect((await readMarker(dir("codex"))).baselineChecksum).to.equal(
            original.baselineChecksum
        );
        expect(await readSkill(dir("codex"))).to.equal(
            skillMarkdown("alpha", "v1")
        );

        const synced = JSON.parse(await run(["agent-skill", "sync", "--json"]));
        expect(synced.status).to.equal("success");
        expect(synced.counts).to.deep.include({ updated: 3, unchanged: 1 });
        for (const harness of ["codex", "opencode", "dsh"] as const)
            expect(await readSkill(dir(harness))).to.equal(
                skillMarkdown("alpha", "improved in Claude")
            );
    });

    it("publishes a Dev-installed copy to Dev while Prod is active", async () => {
        const prod = await startInstance(path.join(env.tmp, "prod"));
        try {
            const cfg = await loadConfig();
            cfg.profiles.prod = { baseUrl: prod.remote.baseUrl };
            cfg.activeProfile = "prod";
            await saveConfig(cfg);
            await fs.writeFile(
                path.join(dir("codex"), "SKILL.md"),
                skillMarkdown("alpha", "dev edit while prod is active")
            );
            const baseline = (await readMarker(dir("codex"))).baselineChecksum;

            const published = JSON.parse(
                await run(["agent-skill", "publish", dir("codex"), "--json"])
            );
            expect(published.id).to.equal(dev.remote.idFor("alpha"));
            expect(published.installation.sourceProfile).to.equal("dev");
            expect(dev.puts()).to.have.length(1);
            expect(dev.puts()[0].headers["if-match"]).to.equal(`"${baseline}"`);
            expect(prod.server.requests).to.have.length(0);
            expect((await loadConfig()).activeProfile).to.equal("prod");
        } finally {
            await prod.server.close();
        }
    });

    it("refuses when the recorded account's credentials are unavailable or mismatched", async () => {
        await fs.writeFile(
            path.join(dir("claude"), "SKILL.md"),
            skillMarkdown("alpha", "edit")
        );
        // Same instance, but the credentials now authenticate another user.
        const realUser = dev.remote.userId;
        dev.remote.userId = "00000000-0000-4000-8000-000000000999";
        const mismatched = await rejects(
            run(["agent-skill", "publish", dir("claude")])
        );
        expect(mismatched).to.be.instanceOf(UsageError);
        expect(mismatched.message).to.include(realUser);
        dev.remote.userId = realUser;

        // No configured profile for the recorded instance at all.
        const other = await startInstance(path.join(env.tmp, "other"));
        try {
            await saveConfig({
                activeProfile: "other",
                profiles: { other: { baseUrl: other.remote.baseUrl } }
            });
            const missing = await rejects(
                run(["agent-skill", "publish", dir("claude")])
            );
            expect(missing).to.be.instanceOf(UsageError);
            expect(missing.message).to.include("never publishes");
            expect(other.server.requests).to.have.length(0);
        } finally {
            await other.server.close();
        }
        expect(dev.puts()).to.have.length(0);
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
        const synced = JSON.parse(await run(["agent-skill", "sync", "--json"]));
        expect(synced.status).to.equal("partial");
        expect(
            synced.conflicts.map((c: any) => [c.harness, c.reason])
        ).to.deep.equal([["codex", "LOCAL_MODIFICATION"]]);
    });

    it("exits nonzero for a partial sync", async () => {
        await fs.writeFile(
            path.join(dir("dsh"), "SKILL.md"),
            skillMarkdown("alpha", "edit")
        );
        await dev.remote.publish("alpha", "v2");
        const program = new Command();
        program.exitOverride();
        registerAgentSkillCommands(program);
        const previous = process.exitCode;
        try {
            process.exitCode = undefined;
            await captureStdout(() =>
                program.parseAsync(["agent-skill", "sync", "--json"], {
                    from: "user"
                })
            );
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
        dev.state.rejectNextPut = true;
        const stale = await rejects(
            run(["agent-skill", "publish", dir("claude")])
        );
        expect(stale).to.be.instanceOf(UsageError);
        expect(stale.message).to.include("--force");

        await run([
            "agent-skill",
            "publish",
            dir("claude"),
            "--force",
            "--json"
        ]);
        expect(dev.puts()).to.have.length(2);
    });

    it("refuses a copy whose marker is invalid", async () => {
        const copy = path.join(env.tmp, "copied-skill");
        await fs.cp(dir("claude"), copy, { recursive: true });
        await fs.writeFile(
            path.join(copy, AGENT_SKILL_INSTALL_MARKER),
            "{not valid"
        );
        const error = await rejects(run(["agent-skill", "publish", copy]));
        expect(error).to.be.instanceOf(UsageError);
        expect(error.message).to.include(AGENT_SKILL_INSTALL_MARKER);
        expect(dev.puts()).to.have.length(0);
    });

    it("publishes a pulled working directory back to its original account", async () => {
        const id = dev.remote.idFor("alpha");
        const working = path.join(env.tmp, "working-alpha");
        await run(["agent-skill", "pull", `user/${id}`, "-o", working]);
        const prod = await startInstance(path.join(env.tmp, "prod"));
        try {
            const cfg = await loadConfig();
            cfg.profiles.prod = { baseUrl: prod.remote.baseUrl };
            cfg.activeProfile = "prod";
            await saveConfig(cfg);
            await fs.writeFile(
                path.join(working, "SKILL.md"),
                skillMarkdown("alpha", "authored while prod is active")
            );
            await run(["agent-skill", "publish", working, "--json"]);
            expect(dev.puts()).to.have.length(1);
            expect(prod.server.requests).to.have.length(0);
        } finally {
            await prod.server.close();
        }
    });

    it("delete retires clean copies and keeps a modified one as a conflict", async () => {
        await fs.writeFile(
            path.join(dir("opencode"), "SKILL.md"),
            skillMarkdown("alpha", "opencode edit")
        );
        const result = JSON.parse(
            await run([
                "agent-skill",
                "delete",
                `user/${dev.remote.idFor("alpha")}`,
                "--json"
            ])
        );
        expect(result.deleted).to.equal(true);
        expect(result.local.status).to.equal("partial");
        expect(
            result.local.conflicts.map((c: any) => [c.harness, c.reason])
        ).to.deep.equal([["opencode", "NOT_DESIRED_LOCAL_MODIFICATION"]]);
        // Clean copies are removed; only the edited one is kept.
        for (const harness of ["claude", "codex", "dsh"] as const)
            expect(await pathExists(dir(harness))).to.equal(false);
        expect(await pathExists(dir("opencode"))).to.equal(true);

        const forced = JSON.parse(
            await run(["agent-skill", "sync", "--force", "--json"])
        );
        expect(forced.counts.removed).to.equal(1);
        expect(await pathExists(dir("opencode"))).to.equal(false);
    });

    describe("publication cache", () => {
        const archiveDownloads = () =>
            dev.server.requests.filter(
                (r) => r.method === "GET" && r.url.endsWith("/archive")
            ).length;
        const sourceState = async () =>
            loadAgentSkillSourceState(
                createAgentSkillSourceIdentity({
                    baseUrl: dev.remote.baseUrl,
                    tenantId: "7",
                    userId: dev.remote.userId
                })
            );
        const cachedBytes = async (id: string, checksum: string) =>
            fs.readFile(
                agentSkillArchivePath(
                    (await sourceState()).identity,
                    { type: "user", id },
                    checksum
                )
            );

        it("caches the acknowledged ZIP of an installed copy without re-verifying the manifest", async () => {
            const before = (await sourceState()).snapshot!;
            await fs.writeFile(
                path.join(dir("claude"), "SKILL.md"),
                skillMarkdown("alpha", "published from claude")
            );
            const published = JSON.parse(
                await run(["agent-skill", "publish", dir("claude"), "--json"])
            );
            expect(published.localCache).to.equal("updated");
            const put = dev.puts()[0];
            expect(
                (await cachedBytes(published.id, published.checksum)).equals(
                    put.body
                )
            ).to.equal(true);
            const after = (await sourceState()).snapshot!;
            // One publication does not make the whole manifest fresh.
            expect(after.verifiedAt).to.equal(before.verifiedAt);
            expect(Object.keys(after.items)).to.deep.equal(
                Object.keys(before.items)
            );

            const downloads = archiveDownloads();
            const synced = JSON.parse(
                await run(["agent-skill", "sync", "--json"])
            );
            expect(synced.counts.updated).to.equal(3);
            expect(archiveDownloads()).to.equal(downloads);
        });

        it("caches a newly published skill and a pulled working directory", async () => {
            const before = (await sourceState()).snapshot!;
            const fresh = path.join(env.tmp, "fresh-skill");
            await run([
                "agent-skill",
                "init",
                "fresh-skill",
                "-o",
                fresh,
                "--description",
                "Skill fresh-skill"
            ]);
            await fs.writeFile(
                path.join(fresh, "SKILL.md"),
                skillMarkdown("fresh-skill", "brand new")
            );
            const created = JSON.parse(
                await run(["agent-skill", "publish", fresh, "--json"])
            );
            expect(created.localCache).to.equal("updated");
            // Cached as a blob only; no single-item snapshot is invented.
            expect((await sourceState()).snapshot!.items).to.not.have.property(
                `user/${created.id}`
            );
            expect((await sourceState()).snapshot!.verifiedAt).to.equal(
                before.verifiedAt
            );

            const working = path.join(env.tmp, "working-alpha");
            await run([
                "agent-skill",
                "pull",
                `user/${dev.remote.idFor("alpha")}`,
                "-o",
                working
            ]);
            await fs.writeFile(
                path.join(working, "SKILL.md"),
                skillMarkdown("alpha", "authored in working dir")
            );
            const updated = JSON.parse(
                await run(["agent-skill", "publish", working, "--json"])
            );
            expect(updated.localCache).to.equal("updated");
            expect(
                (await cachedBytes(updated.id, updated.checksum)).length
            ).to.be.greaterThan(0);

            const downloads = archiveDownloads();
            const synced = JSON.parse(
                await run(["agent-skill", "sync", "--json"])
            );
            expect(synced.status).to.equal("success");
            expect(synced.counts).to.deep.include({ installed: 4, updated: 4 });
            expect(archiveDownloads()).to.equal(downloads);
        });

        it("reports a local cache failure without claiming the publication failed", async () => {
            const archives = path.dirname(
                agentSkillArchivePath(
                    (await sourceState()).identity,
                    { type: "user", id: dev.remote.idFor("alpha") },
                    "0".repeat(64)
                )
            );
            await fs.chmod(archives, 0o500);
            try {
                await fs.writeFile(
                    path.join(dir("claude"), "SKILL.md"),
                    skillMarkdown("alpha", "edit")
                );
                const published = JSON.parse(
                    await run([
                        "agent-skill",
                        "publish",
                        dir("claude"),
                        "--json"
                    ])
                );
                expect(published.checksum).to.match(/^[0-9a-f]{64}$/);
                expect(published.localCache).to.equal("failed");
                expect(published.installation.baselineUpdated).to.equal(false);
                expect(dev.puts()).to.have.length(1);
                expect(
                    dev.remote.items.get(dev.remote.idFor("alpha"))!.meta
                        .checksum
                ).to.equal(published.checksum);
            } finally {
                await fs.chmod(archives, 0o700);
            }
        });
    });
});
