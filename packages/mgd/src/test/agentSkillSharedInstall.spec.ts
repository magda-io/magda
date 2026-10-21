import { expect } from "chai";
import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import {
    AGENT_SKILL_INSTALL_MARKER,
    readProjectedAgentSkillArchive,
    renameAgentSkillMarkdown,
    sha256Hex,
    validateAgentSkillArchive
} from "../agentSkillArchive.js";
import { AgentSkillClient } from "../agentSkillClient.js";
import {
    createAgentSkillSourceIdentity,
    loadAgentSkillSourceState,
    parseInstallMarker
} from "../agentSkillLocalState.js";
import {
    syncLocalAgentSkills,
    syncWorkspaceAgentSkills
} from "../agentSkillSync.js";
import type { AgentSkillSyncResult } from "../agentSkillTypes.js";
import { registerAgentSkillCommands } from "../commands/agentSkill.js";
import { MagdaClient } from "../client.js";
import { UsageError } from "../errors.js";
import { saveConfig } from "../profile.js";
import { captureStdout } from "./captureStdout.js";
import {
    FakeAgentSkillRemote,
    HarnessEnvironment,
    USER_ID,
    createHarnessEnvironment,
    pathExists,
    readMarker,
    readSkill,
    skillMarkdown
} from "./agentSkillFixtures.js";
import { startMockServer } from "./mockServer.js";

const PUBLISHER_ID = "00000000-0000-4000-8000-0000000000a1";

const codes = (result: AgentSkillSyncResult, code: string) =>
    result.items.filter((item) => item.code === code);

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

describe("installed shared Agent Skills (#3861)", () => {
    describe("alias projection", () => {
        const markdown = (name: string) =>
            Buffer.from(
                `---\nname: ${name}\ndescription: "Reports: CSV"\nlicense: MIT\n---\n\n# ${name}\n\nKeep name: lines in the body.\nname: not frontmatter\n`
            );

        it("rewrites only the frontmatter name line", () => {
            const renamed = renameAgentSkillMarkdown(
                markdown("csv-reporter"),
                "csv-reporter",
                "team-csv"
            ).toString();
            expect(renamed).to.equal(
                markdown("csv-reporter")
                    .toString()
                    .replace("name: csv-reporter\n", "name: team-csv\n")
            );
            expect(renamed).to.include("name: not frontmatter");
        });

        it("refuses frontmatter it cannot rename safely", () => {
            for (const content of [
                "---\nname: a\nname: a\ndescription: d\n---\nbody\n",
                "---\n{name: a, description: d}\n---\nbody\n",
                "---\n  name: a\ndescription: d\n---\nbody\n"
            ])
                expect(() =>
                    renameAgentSkillMarkdown(Buffer.from(content), "a", "b")
                ).to.throw();
        });
    });

    describe("synchronization", () => {
        let env: HarnessEnvironment;
        let bob: FakeAgentSkillRemote;
        let alice: FakeAgentSkillRemote;
        const dir = (name: string, harness: "claude" | "codex" = "claude") =>
            path.join(env.roots[harness], name);
        const sync = (force = false) =>
            syncLocalAgentSkills(bob.client(), {
                selectedProfile: "bob",
                activate: true,
                force
            });

        beforeEach(async () => {
            env = await createHarnessEnvironment("mgd-shared-");
            bob = new FakeAgentSkillRemote(
                "https://magda.example/api",
                path.join(env.tmp, "bob")
            );
            alice = new FakeAgentSkillRemote(
                "https://magda.example/api",
                path.join(env.tmp, "alice"),
                PUBLISHER_ID
            );
            await saveConfig({
                activeProfile: "bob",
                profiles: { bob: { baseUrl: "https://magda.example/api" } }
            });
        });

        afterEach(async () => {
            await env.restore();
        });

        it("installs an independent aliased copy with recipient provenance", async () => {
            const { meta } = await alice.publish("csv-reporter", "v1");
            const installationId = bob.installShared(
                alice,
                "csv-reporter",
                "team-csv"
            );
            const result = await sync();
            expect(result.status).to.equal("success");
            expect(await readSkill(dir("team-csv"))).to.equal(
                skillMarkdown("csv-reporter", "v1").replace(
                    "name: csv-reporter\n",
                    "name: team-csv\n"
                )
            );
            const identity = createAgentSkillSourceIdentity({
                baseUrl: bob.baseUrl,
                tenantId: "7",
                userId: USER_ID
            });
            const marker = await readMarker(dir("team-csv"));
            expect(marker).to.deep.include({
                sourceKey: identity.key,
                source: {
                    type: "user",
                    id: meta.id,
                    kind: "installation"
                },
                name: "team-csv",
                installationRecordId: installationId,
                alias: "team-csv",
                baselineChecksum: meta.checksum
            });
            expect(marker.baselineTreeDigest).to.not.equal(
                (
                    await validateAgentSkillArchive(
                        alice.items.get(meta.id)!.bytes,
                        "user"
                    )
                ).treeDigest
            );
            expect(JSON.stringify(marker)).not.to.match(/apiKey|secret/i);
            // The cached archive is the publisher's exact ZIP.
            const state = await loadAgentSkillSourceState(identity);
            const cached = state.snapshot!.items[
                `installation/${installationId}`
            ];
            expect(cached).to.deep.include({
                sourceKind: "installation",
                installationRecordId: installationId,
                alias: "team-csv",
                checksum: meta.checksum
            });
            expect(sha256Hex(await fs.readFile(cached.archiveFile))).to.equal(
                meta.checksum
            );
            expect((await sync()).counts.unchanged).to.equal(4);
        });

        it("updates clean copies, keeps edited ones, and proceeds independently", async () => {
            await alice.publish("csv-reporter", "v1");
            await bob.publish("own-skill", "mine v1");
            bob.installShared(alice, "csv-reporter");
            await sync();
            await fs.appendFile(
                path.join(dir("csv-reporter", "codex"), "SKILL.md"),
                "\nmy edit\n"
            );
            await alice.publish("csv-reporter", "v2");
            await bob.publish("own-skill", "mine v2");
            const result = await sync();
            expect(result.status).to.equal("partial");
            expect(await readSkill(dir("csv-reporter"))).to.equal(
                skillMarkdown("csv-reporter", "v2")
            );
            expect(await readSkill(dir("csv-reporter", "codex"))).to.include(
                "my edit"
            );
            expect(await readSkill(dir("own-skill", "codex"))).to.equal(
                skillMarkdown("own-skill", "mine v2")
            );
            expect(
                result.conflicts!.map((conflict) => [
                    conflict.name,
                    conflict.harness,
                    conflict.reason
                ])
            ).to.deep.equal([["csv-reporter", "codex", "LOCAL_MODIFICATION"]]);
            const forced = await sync(true);
            expect(forced.status).to.equal("success");
            expect(await readSkill(dir("csv-reporter", "codex"))).to.equal(
                skillMarkdown("csv-reporter", "v2")
            );
        });

        it("removes clean copies after an authoritative revocation and keeps edited ones until forced", async () => {
            await alice.publish("csv-reporter", "v1");
            await alice.publish("other", "v1");
            const revoked = bob.installShared(alice, "csv-reporter");
            bob.installShared(alice, "other");
            await sync();
            await fs.appendFile(
                path.join(dir("csv-reporter", "codex"), "SKILL.md"),
                "\nmy edit\n"
            );
            bob.revokeShared(revoked);
            const result = await sync();
            expect(result.status).to.equal("partial");
            expect(await pathExists(dir("csv-reporter"))).to.equal(false);
            expect(await pathExists(dir("csv-reporter", "codex"))).to.equal(
                true
            );
            expect(await pathExists(dir("other"))).to.equal(true);
            expect(
                codes(result, "INSTALLATION_SOURCE_UNAVAILABLE").map(
                    (item) => item.name
                )
            ).to.deep.equal(["csv-reporter"]);
            expect(
                result.conflicts!.map((conflict) => conflict.reason)
            ).to.deep.equal(["NOT_DESIRED_LOCAL_MODIFICATION"]);
            const forced = await sync(true);
            expect(await pathExists(dir("csv-reporter", "codex"))).to.equal(
                false
            );
            // The dangling installation still needs uninstalling.
            expect(forced.status).to.equal("partial");
            bob.unavailableInstallations = [];
            expect((await sync()).status).to.equal("success");
        });

        it("reinstalls a deleted copy, adopts exact content and leaves unrelated directories alone", async () => {
            await alice.publish("csv-reporter", "v1");
            bob.installShared(alice, "csv-reporter", "team-csv");
            await sync();
            await fs.rm(dir("team-csv"), { recursive: true });
            await fs.rm(
                path.join(dir("team-csv", "codex"), AGENT_SKILL_INSTALL_MARKER)
            );
            await fs.mkdir(dir("my-notes"));
            await fs.writeFile(path.join(dir("my-notes"), "SKILL.md"), "mine");
            const result = await sync();
            expect(result.status).to.equal("success");
            expect(await pathExists(dir("team-csv"))).to.equal(true);
            expect(codes(result, "ADOPTED")).to.have.length(1);
            expect(await readSkill(dir("my-notes"))).to.equal("mine");
        });

        it("aborts before any change on an uncertain manifest or source, even with --force", async () => {
            await alice.publish("csv-reporter", "v1");
            bob.installShared(alice, "csv-reporter");
            await sync();
            await fs.appendFile(
                path.join(dir("csv-reporter"), "SKILL.md"),
                "\nmy edit\n"
            );
            await alice.publish("csv-reporter", "v2");
            const before = await readSkill(dir("csv-reporter"));

            bob.warnings = [
                { sourceKind: "installation", code: "SOURCE_PENDING" }
            ];
            let result = await sync(true);
            expect(result.status).to.equal("failed");
            expect(result.remoteSourceFailed).to.equal(true);
            expect(await readSkill(dir("csv-reporter"))).to.equal(before);

            bob.warnings = [];
            bob.failDownloads.add("csv-reporter");
            result = await sync(true);
            expect(result.status).to.equal("failed");
            expect(codes(result, "DOWNLOAD_FAILED")).to.have.length(1);
            expect(await readSkill(dir("csv-reporter"))).to.equal(before);

            bob.failDownloads.clear();
            bob.failManifest = true;
            result = await sync(true);
            expect(result.status).to.equal("failed");
            expect(await readSkill(dir("csv-reporter"))).to.equal(before);
        });

        it("uses the same engine for the Workspace DSH root, alongside system and own skills", async () => {
            await alice.publish("csv-reporter", "v1");
            await bob.publish("system-report", "sys", {}, "system");
            await bob.publish("own-skill", "mine");
            const revoked = bob.installShared(
                alice,
                "csv-reporter",
                "team-csv"
            );
            let result = await syncWorkspaceAgentSkills(bob.client(), "all");
            expect(result.status).to.equal("success");
            expect((await fs.readdir(env.roots.dsh)).sort()).to.deep.equal([
                "own-skill",
                "system-report",
                "team-csv"
            ]);
            bob.revokeShared(revoked);
            result = await syncWorkspaceAgentSkills(bob.client(), "all");
            expect(result.status).to.equal("partial");
            expect((await fs.readdir(env.roots.dsh)).sort()).to.deep.equal([
                "own-skill",
                "system-report"
            ]);
        });

        it("rejects a downloaded source that does not match the manifest", async () => {
            const { meta } = await alice.publish("csv-reporter", "v1");
            bob.installShared(alice, "csv-reporter");
            // The publisher's bytes change without the manifest knowing.
            const tampered = await alice.publish("csv-reporter", "evil");
            alice.items.set(meta.id, {
                meta,
                bytes: tampered.archive.bytes
            });
            const result = await sync(true);
            expect(result.status).to.equal("failed");
            expect(await pathExists(dir("csv-reporter"))).to.equal(false);
        });
    });

    describe("manifest validation", () => {
        const identity = { tenantId: "7", userId: USER_ID };
        const source = {
            id: `agent-skill-${PUBLISHER_ID}-csv-reporter`,
            name: "csv-reporter",
            description: "d",
            type: "user",
            userId: PUBLISHER_ID,
            ownerId: PUBLISHER_ID,
            createdAt: "2026-10-21T00:00:00Z",
            createdBy: PUBLISHER_ID,
            updatedAt: "2026-10-21T00:00:00Z",
            updatedBy: PUBLISHER_ID,
            checksum: "a".repeat(64)
        };
        const item = (overrides: Record<string, unknown> = {}) => ({
            selectionId: `agent-skill-${USER_ID}-team-csv`,
            effectiveName: "team-csv",
            sourceKind: "installation",
            source,
            installation: {
                id: `agent-skill-${USER_ID}-team-csv`,
                userId: USER_ID,
                sourceSkillId: source.id,
                alias: "team-csv"
            },
            ...overrides
        });

        async function manifestWith(
            body: unknown,
            kind: "local" | "workspace" = "local"
        ) {
            const server = await startMockServer([
                {
                    method: "GET",
                    path:
                        kind === "local"
                            ? "/api/v0/agent/skills/local-sync-manifest"
                            : "/api/v0/agent/skills/workspace-manifest",
                    handler: (_req, res) => {
                        res.writeHead(200, {
                            "content-type": "application/json"
                        });
                        res.end(JSON.stringify(body));
                    }
                }
            ]);
            try {
                const client = new AgentSkillClient(
                    new MagdaClient({ baseUrl: `${server.url}/api` })
                );
                return await (kind === "local"
                    ? client.localManifest()
                    : client.manifest());
            } finally {
                await server.close();
            }
        }

        const manifest = (items: unknown[], extra = {}) => ({
            version: 1,
            complete: true,
            identity,
            items,
            warnings: [],
            ...extra
        });

        it("accepts the recipient's own installations of other users' skills", async () => {
            const local = await manifestWith(manifest([item()]));
            expect(local.items[0].installation?.alias).to.equal("team-csv");
            const workspace = await manifestWith(
                manifest([item()]),
                "workspace"
            );
            expect(workspace.items).to.have.length(1);
            expect(local.unavailableInstallations).to.deep.equal([]);
        });

        it("rejects forged installation identities", async () => {
            const forged = [
                item({
                    installation: {
                        ...item().installation,
                        userId: PUBLISHER_ID
                    }
                }),
                item({ selectionId: `agent-skill-${USER_ID}-other` }),
                item({ effectiveName: "system-csv" }),
                item({
                    effectiveName: "csv-reporter",
                    selectionId: `agent-skill-${USER_ID}-csv-reporter`,
                    installation: {
                        id: `agent-skill-${USER_ID}-csv-reporter`,
                        userId: USER_ID,
                        sourceSkillId: source.id,
                        alias: "csv-reporter"
                    }
                }),
                item({
                    source: {
                        ...source,
                        userId: USER_ID,
                        ownerId: USER_ID,
                        id: `agent-skill-${USER_ID}-csv-reporter`
                    },
                    installation: {
                        ...item().installation,
                        sourceSkillId: `agent-skill-${USER_ID}-csv-reporter`
                    }
                }),
                item({ installation: undefined }),
                {
                    ...item(),
                    sourceKind: "own-user-publication"
                }
            ];
            for (const value of forged) {
                const error = await rejects(manifestWith(manifest([value])));
                expect(error.message, JSON.stringify(value)).to.match(
                    /Invalid Agent Skill/
                );
            }
            const badUnavailable = await rejects(
                manifestWith(
                    manifest([], {
                        unavailableInstallations: [
                            {
                                installationId: `agent-skill-${PUBLISHER_ID}-x`,
                                effectiveName: "x",
                                sourceSkillId: source.id,
                                code: "SOURCE_UNAVAILABLE"
                            }
                        ]
                    })
                )
            );
            expect(badUnavailable.message).to.match(/Invalid Agent Skill/);
        });
    });

    describe("publish --force fork", () => {
        let env: HarnessEnvironment;
        let bob: FakeAgentSkillRemote;
        let alice: FakeAgentSkillRemote;
        let server: Awaited<ReturnType<typeof startMockServer>>;
        let forks: Array<{ id: string; body: Buffer }>;
        let failNextFork: boolean;

        beforeEach(async () => {
            env = await createHarnessEnvironment("mgd-fork-");
            forks = [];
            failNextFork = false;
            bob = new FakeAgentSkillRemote("", path.join(env.tmp, "bob"));
            alice = new FakeAgentSkillRemote(
                "",
                path.join(env.tmp, "alice"),
                PUBLISHER_ID
            );
            server = await startMockServer([
                ...bob.routes(),
                {
                    method: "POST",
                    path: /^\/api\/v0\/agent\/skills\/installations\/[^/]+\/publish$/,
                    handler: (req, res, recorded) => {
                        void (async () => {
                            const id = decodeURIComponent(
                                (req.url || "").split("/").slice(-2)[0]
                            );
                            forks.push({ id, body: recorded.body });
                            if (failNextFork) {
                                failNextFork = false;
                                bob.shared.delete(id);
                                res.writeHead(503, {
                                    "content-type": "application/json"
                                });
                                res.end(
                                    JSON.stringify({
                                        error: {
                                            code: "AGENT_SKILL_FORK_INCOMPLETE",
                                            message: "storage unavailable",
                                            retryable: true
                                        }
                                    })
                                );
                                return;
                            }
                            const validated = await validateAgentSkillArchive(
                                recorded.body,
                                "user"
                            );
                            const removed = bob.shared.delete(id);
                            const meta = {
                                id,
                                name: validated.name,
                                description: validated.description,
                                type: "user" as const,
                                userId: bob.userId,
                                ownerId: bob.userId,
                                createdAt: "2026-10-21T00:00:00.000Z",
                                createdBy: bob.userId,
                                updatedAt: "2026-10-21T00:00:00.000Z",
                                updatedBy: bob.userId,
                                checksum: sha256Hex(recorded.body)
                            };
                            bob.items.set(id, { meta, bytes: recorded.body });
                            res.writeHead(201, {
                                "content-type": "application/json"
                            });
                            res.end(
                                JSON.stringify({
                                    publication: meta,
                                    installationRemoved: removed
                                })
                            );
                        })();
                    }
                }
            ]);
            bob.baseUrl = `${server.url}/api`;
            alice.baseUrl = bob.baseUrl;
            await saveConfig({
                activeProfile: "bob",
                profiles: {
                    bob: {
                        baseUrl: bob.baseUrl,
                        apiKeyId: "bob-key",
                        apiKey: "bob-secret"
                    }
                }
            });
            await alice.publish("csv-reporter", "v1");
            bob.installShared(alice, "csv-reporter", "team-csv");
            await syncLocalAgentSkills(bob.client(), {
                selectedProfile: "bob",
                activate: true
            });
        });

        afterEach(async () => {
            await server.close();
            await env.restore();
        });

        const installed = (harness: "claude" | "codex" = "claude") =>
            path.join(env.roots[harness], "team-csv");

        it("refuses a plain publish and explains the fork", async () => {
            const error = await rejects(
                run(["agent-skill", "publish", installed()])
            );
            expect(error).to.be.instanceOf(UsageError);
            expect(error.message).to.match(/fork/);
            expect(error.message).to.match(/never changed/);
            expect(error.message).to.include("--force");
            expect(forks).to.deep.equal([]);
        });

        it("publishes the edited copy as the recipient's own skill and rebinds only that copy", async () => {
            await fs.appendFile(
                path.join(installed(), "SKILL.md"),
                "\nBob's edit\n"
            );
            const sourceBefore = alice.items.get(alice.idFor("csv-reporter"))!;
            const output = JSON.parse(
                await run([
                    "agent-skill",
                    "publish",
                    installed(),
                    "--force",
                    "--json"
                ])
            );
            expect(forks.map((fork) => fork.id)).to.deep.equal([
                `agent-skill-${USER_ID}-team-csv`
            ]);
            expect(output).to.deep.include({
                id: `agent-skill-${USER_ID}-team-csv`,
                installationRemoved: true,
                localCache: "updated"
            });
            // The ZIP sent is the edited local copy, without the marker.
            const sent = await validateAgentSkillArchive(forks[0].body, "user");
            expect(sent.name).to.equal("team-csv");
            expect(alice.items.get(alice.idFor("csv-reporter"))).to.equal(
                sourceBefore
            );
            const marker = parseInstallMarker(
                await fs.readFile(
                    path.join(installed(), AGENT_SKILL_INSTALL_MARKER)
                ),
                "team-csv"
            )!;
            expect(marker.source).to.deep.equal({
                type: "user",
                id: `agent-skill-${USER_ID}-team-csv`,
                kind: "own-user-publication"
            });
            expect(marker.installationRecordId).to.equal(undefined);
            expect(marker.baselineChecksum).to.equal(sha256Hex(forks[0].body));
            // The other harness copy is not changed until it syncs.
            expect((await readMarker(installed("codex"))).source.kind).to.equal(
                "installation"
            );
            const result = await syncLocalAgentSkills(bob.client(), {
                selectedProfile: "bob",
                activate: true
            });
            expect(result.status).to.equal("success");
            expect(await readSkill(installed("codex"))).to.include(
                "Bob's edit"
            );
            // The exact accepted bytes were cached: no download needed.
            expect(bob.downloads).to.equal(1);
        });

        it("keeps the local files and explains an incomplete fork, then completes on retry", async () => {
            await fs.appendFile(path.join(installed(), "SKILL.md"), "\nedit\n");
            const before = await readSkill(installed());
            failNextFork = true;
            const error = await rejects(
                run(["agent-skill", "publish", installed(), "--force"])
            );
            expect(error).to.be.instanceOf(UsageError);
            expect(error.message).to.match(/was removed/);
            expect(await readSkill(installed())).to.equal(before);
            expect((await readMarker(installed())).source.kind).to.equal(
                "installation"
            );
            await run(["agent-skill", "publish", installed(), "--force"]);
            expect(forks).to.have.length(2);
            expect((await readMarker(installed())).source.kind).to.equal(
                "own-user-publication"
            );
        });

        it("uses the recorded recipient account, never another active profile", async () => {
            await saveConfig({
                activeProfile: "other",
                profiles: {
                    other: {
                        baseUrl: "https://other.example/api",
                        apiKeyId: "k",
                        apiKey: "s"
                    }
                }
            });
            const error = await rejects(
                run(["agent-skill", "publish", installed(), "--force"])
            );
            expect(error).to.be.instanceOf(UsageError);
            expect(error.message).to.match(/No configured profile/);
            expect(forks).to.deep.equal([]);
        });

        it("refuses a renamed copy before contacting MAGDA", async () => {
            const file = path.join(installed(), "SKILL.md");
            await fs.writeFile(
                file,
                (await fs.readFile(file, "utf8")).replace(
                    "name: team-csv",
                    "name: renamed"
                )
            );
            const error = await rejects(
                run(["agent-skill", "publish", installed(), "--force"])
            );
            expect(error.message).to.match(/no longer matches/);
            expect(forks).to.deep.equal([]);
            expect(await pathExists(installed())).to.equal(true);
        });
    });

    it("projects archives without changing the publisher's bytes", async () => {
        const env = await createHarnessEnvironment("mgd-project-");
        try {
            const remote = new FakeAgentSkillRemote("", env.tmp, PUBLISHER_ID);
            const { archive } = await remote.publish("csv-reporter", "v1");
            const projected = await readProjectedAgentSkillArchive(
                archive.bytes,
                "user",
                "team-csv"
            );
            expect(projected.archive.checksum).to.equal(archive.archiveSha256);
            expect(projected.name).to.equal("team-csv");
            expect(
                projected.files
                    .find((file) => file.path === "SKILL.md")!
                    .content.toString()
            ).to.include("name: team-csv");
            await expectRejects(
                readProjectedAgentSkillArchive(
                    archive.bytes,
                    "user",
                    "system-x"
                )
            );
        } finally {
            await env.restore();
        }
    });
});

async function expectRejects(promise: Promise<unknown>) {
    await rejects(promise);
}
