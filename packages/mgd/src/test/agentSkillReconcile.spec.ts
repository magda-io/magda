import { expect } from "chai";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { AGENT_SKILL_INSTALL_MARKER } from "../agentSkillArchive.js";
import {
    agentSkillDataRoot,
    createAgentSkillSourceIdentity,
    loadAgentSkillSourceState,
    parseInstallMarker
} from "../agentSkillLocalState.js";
import {
    STAGING_DIRECTORY,
    agentSkillReconcileTestHooks
} from "../agentSkillReconcile.js";
import {
    syncLocalAgentSkills,
    syncWorkspaceAgentSkills
} from "../agentSkillSync.js";
import { saveConfig } from "../profile.js";
import type { AgentSkillSyncResult } from "../agentSkillTypes.js";
import {
    FakeAgentSkillRemote,
    HarnessEnvironment,
    createHarnessEnvironment,
    pathExists,
    readMarker,
    readSkill,
    skillMarkdown
} from "./agentSkillFixtures.js";

type Harness = "claude" | "codex" | "opencode" | "dsh";
const HARNESSES: Harness[] = ["claude", "codex", "opencode", "dsh"];

const codes = (result: AgentSkillSyncResult, code: string) =>
    result.items.filter((item) => item.code === code);

async function listFiles(directory: string): Promise<string[]> {
    const found: string[] = [];
    const walk = async (current: string) => {
        for (const entry of await fs.readdir(current, {
            withFileTypes: true
        })) {
            const child = path.join(current, entry.name);
            found.push(child);
            if (entry.isDirectory()) await walk(child);
        }
    };
    if (await pathExists(directory)) await walk(directory);
    return found;
}

describe("scan-based Agent Skill reconciliation", () => {
    let env: HarnessEnvironment;
    let remote: FakeAgentSkillRemote;
    const dir = (harness: Harness, name = "alpha") =>
        path.join(env.roots[harness], name);
    const sync = (force = false) =>
        syncLocalAgentSkills(remote.client(), {
            selectedProfile: "dev",
            activate: true,
            force
        });
    const crash = () =>
        Object.assign(new Error("simulated crash"), { simulatedCrash: true });

    beforeEach(async () => {
        env = await createHarnessEnvironment("mgd-reconcile-");
        remote = new FakeAgentSkillRemote(
            "https://dev.example/api",
            path.join(env.tmp, "remote")
        );
        await saveConfig({
            activeProfile: "dev",
            profiles: { dev: { baseUrl: "https://dev.example/api" } }
        });
    });

    afterEach(async () => {
        delete agentSkillReconcileTestHooks.afterBackup;
        delete agentSkillReconcileTestHooks.beforeOperation;
        await env.restore();
    });

    it("installs self-describing copies and rediscovers them by scanning, with no central state", async () => {
        const { meta } = await remote.publish("alpha", "v1", {
            "reference.md": "# Reference\n"
        });
        const first = await sync();
        expect(first.status).to.equal("success");
        expect(first.counts.installed).to.equal(4);
        const identity = createAgentSkillSourceIdentity({
            baseUrl: remote.baseUrl,
            tenantId: "7",
            userId: remote.userId
        });
        const ids = new Set<string>();
        for (const harness of HARNESSES) {
            const stat = await fs.lstat(dir(harness));
            expect(stat.isSymbolicLink()).to.equal(false);
            expect(stat.isDirectory()).to.equal(true);
            expect(await readSkill(dir(harness))).to.equal(
                skillMarkdown("alpha", "v1")
            );
            const marker = await readMarker(dir(harness));
            expect(marker).to.include({
                format: "magda-agent-skill-installation",
                sourceKey: identity.key,
                name: "alpha",
                baselineChecksum: meta.checksum
            });
            expect(JSON.stringify(marker)).not.to.match(/apiKey|secret/i);
            ids.add(marker.installationId);
        }
        expect(ids.size).to.equal(4);

        const again = await sync();
        expect(again.status).to.equal("success");
        expect(again.counts.unchanged).to.equal(4);
        // The only durable state is profile config, the verified source cache
        // and each skill's own marker; nothing is left in staging.
        const dataFiles = (await listFiles(agentSkillDataRoot())).map((file) =>
            path.relative(agentSkillDataRoot(), file)
        );
        expect(dataFiles.every((file) => file.startsWith("sources"))).to.equal(
            true
        );
        for (const harness of HARNESSES)
            expect(
                await pathExists(
                    path.join(env.roots[harness], STAGING_DIRECTORY)
                )
            ).to.equal(false);
    });

    it("ignores unrelated directories, including an orphan whose source and marker were removed", async () => {
        await remote.publish("alpha", "v1");
        await sync();
        const unrelated = path.join(env.roots.claude, "my-own");
        await fs.mkdir(unrelated);
        await fs.writeFile(path.join(unrelated, "SKILL.md"), "mine");
        await fs.rm(path.join(dir("codex"), AGENT_SKILL_INSTALL_MARKER));
        await fs.writeFile(
            path.join(dir("opencode"), AGENT_SKILL_INSTALL_MARKER),
            "{malformed"
        );
        remote.remove("alpha");

        const forced = await sync(true);
        expect(forced.status).to.equal("success");
        // Marked clean copies are removed; unmarked/malformed ones are not
        // proof of MAGDA ownership once the name is no longer desired.
        expect(await pathExists(dir("claude"))).to.equal(false);
        expect(await pathExists(dir("dsh"))).to.equal(false);
        expect(await readSkill(dir("codex"))).to.equal(
            skillMarkdown("alpha", "v1")
        );
        expect(await pathExists(dir("opencode"))).to.equal(true);
        expect(await readSkill(unrelated)).to.equal("mine");
    });

    it("reinstalls a manually deleted directory on ordinary sync", async () => {
        await remote.publish("alpha", "v1");
        await sync();
        await fs.rm(dir("codex"), { recursive: true });

        const result = await sync();
        expect(result.status).to.equal("success");
        expect(
            result.items
                .filter((item) => item.action === "installed")
                .map((item) => item.harness)
        ).to.deep.equal(["codex"]);
        expect(await readSkill(dir("codex"))).to.equal(
            skillMarkdown("alpha", "v1")
        );
    });

    it("repairs missing, malformed and stale metadata without touching skill files", async () => {
        const { meta } = await remote.publish("alpha", "v1");
        await sync();
        const markerPath = (harness: Harness) =>
            path.join(dir(harness), AGENT_SKILL_INSTALL_MARKER);
        await fs.rm(markerPath("claude"));
        await fs.writeFile(markerPath("codex"), "{not json");
        const stale = await readMarker(dir("opencode"));
        stale.baselineChecksum = "f".repeat(64);
        stale.baselineTreeDigest = "e".repeat(64);
        await fs.writeFile(markerPath("opencode"), JSON.stringify(stale));
        const repaired = ["claude", "codex", "opencode"] as Harness[];
        const before = await Promise.all(
            repaired.map((harness) =>
                fs.stat(path.join(dir(harness), "SKILL.md"))
            )
        );

        const result = await sync();
        expect(result.status).to.equal("success");
        expect(
            result.items
                .filter((item) => item.action === "updated")
                .map((item) => `${item.harness}:${item.code}`)
                .sort()
        ).to.deep.equal([
            "claude:ADOPTED",
            "codex:METADATA_REPAIRED",
            "opencode:BASELINE_UPDATED"
        ]);
        for (const [position, harness] of repaired.entries()) {
            const after = await fs.stat(path.join(dir(harness), "SKILL.md"));
            expect(after.ino).to.equal(before[position].ino);
            expect(after.mtimeMs).to.equal(before[position].mtimeMs);
            const marker = parseInstallMarker(
                await fs.readFile(markerPath(harness)),
                "alpha"
            );
            expect(marker?.baselineChecksum).to.equal(meta.checksum);
        }
    });

    it("conflicts on a same-name directory with different content until --force", async () => {
        await remote.publish("alpha", "v1");
        await fs.mkdir(dir("claude"), { recursive: true });
        await fs.writeFile(
            path.join(dir("claude"), "SKILL.md"),
            skillMarkdown("alpha", "v1")
        );
        await fs.writeFile(path.join(dir("claude"), "extra.md"), "# mine\n");

        const normal = await sync();
        expect(normal.status).to.equal("partial");
        expect(
            normal.conflicts!.map((c) => [c.harness, c.reason])
        ).to.deep.equal([["claude", "UNRECOGNIZED_DIRECTORY"]]);
        expect(await pathExists(path.join(dir("claude"), "extra.md"))).to.equal(
            true
        );
        // Installs into absent paths are not destructive and still proceed.
        expect(await readSkill(dir("codex"))).to.equal(
            skillMarkdown("alpha", "v1")
        );

        const forced = await sync(true);
        expect(forced.status).to.equal("success");
        expect(
            codes(forced, "FORCED_REPLACE").map((i) => i.path)
        ).to.deep.equal([dir("claude")]);
        expect(await pathExists(path.join(dir("claude"), "extra.md"))).to.equal(
            false
        );
    });

    it("updates an older clean copy but keeps a genuine edit", async () => {
        await remote.publish("alpha", "v1");
        await sync();
        await remote.publish("alpha", "v2");
        expect((await sync()).counts.updated).to.equal(4);

        await fs.writeFile(
            path.join(dir("codex"), "SKILL.md"),
            skillMarkdown("alpha", "my codex edit")
        );
        await remote.publish("alpha", "v3");
        const normal = await sync();
        expect(normal.status).to.equal("partial");
        expect(
            normal.conflicts!.map((c) => [c.harness, c.reason])
        ).to.deep.equal([["codex", "LOCAL_MODIFICATION"]]);
        expect(normal.conflicts![0].source?.profiles).to.deep.equal(["dev"]);
        expect(await readSkill(dir("codex"))).to.equal(
            skillMarkdown("alpha", "my codex edit")
        );
        // The conflict blocks only that installation.
        expect(await readSkill(dir("claude"))).to.equal(
            skillMarkdown("alpha", "v3")
        );
        expect((await sync(true)).status).to.equal("success");
        expect(await readSkill(dir("codex"))).to.equal(
            skillMarkdown("alpha", "v3")
        );
    });

    it("applies independent safe operations while another skill has a conflict", async () => {
        for (const name of ["skill-a", "skill-b", "skill-c", "skill-e"])
            await remote.publish(name, "v1");
        await sync();
        // A: unpublished edit; B: newer remote; C: removed remotely;
        // D: new remote skill; E: identical content, metadata missing.
        await fs.writeFile(
            path.join(dir("claude", "skill-a"), "SKILL.md"),
            skillMarkdown("skill-a", "unpublished edit")
        );
        await remote.publish("skill-a", "v2");
        await remote.publish("skill-b", "v2");
        remote.remove("skill-c");
        await remote.publish("skill-d", "v1");
        await fs.rm(
            path.join(dir("claude", "skill-e"), AGENT_SKILL_INSTALL_MARKER)
        );
        const markerStat = await fs.stat(
            path.join(dir("claude", "skill-e"), "SKILL.md")
        );

        const result = await sync();
        expect(result.status).to.equal("partial");
        expect(
            result.conflicts!.map((c) => `${c.harness}:${c.name}:${c.reason}`)
        ).to.deep.equal(["claude:skill-a:LOCAL_MODIFICATION"]);
        const claude = (name: string) =>
            result.items.find(
                (item) => item.harness === "claude" && item.name === name
            );
        expect(claude("skill-b")?.action).to.equal("updated");
        expect(claude("skill-c")?.action).to.equal("removed");
        expect(claude("skill-d")?.action).to.equal("installed");
        expect(claude("skill-e")?.code).to.equal("ADOPTED");
        expect(await readSkill(dir("claude", "skill-a"))).to.equal(
            skillMarkdown("skill-a", "unpublished edit")
        );
        expect(await readSkill(dir("claude", "skill-b"))).to.equal(
            skillMarkdown("skill-b", "v2")
        );
        expect(await pathExists(dir("claude", "skill-c"))).to.equal(false);
        expect(await readSkill(dir("claude", "skill-d"))).to.equal(
            skillMarkdown("skill-d", "v1")
        );
        expect(
            (await fs.stat(path.join(dir("claude", "skill-e"), "SKILL.md")))
                .mtimeMs
        ).to.equal(markerStat.mtimeMs);
        // Other harnesses have no conflict and are fully reconciled.
        expect(await readSkill(dir("codex", "skill-a"))).to.equal(
            skillMarkdown("skill-a", "v2")
        );
    });

    it("removes remotely deleted clean marked copies; edited ones need --force", async () => {
        await remote.publish("alpha", "v1");
        await sync();
        await fs.writeFile(
            path.join(dir("dsh"), "SKILL.md"),
            skillMarkdown("alpha", "dsh edit")
        );
        remote.remove("alpha");

        const normal = await sync();
        expect(normal.status).to.equal("partial");
        expect(
            normal.conflicts!.map((c) => [c.harness, c.reason])
        ).to.deep.equal([["dsh", "NOT_DESIRED_LOCAL_MODIFICATION"]]);
        expect(await readSkill(dir("dsh"))).to.equal(
            skillMarkdown("alpha", "dsh edit")
        );

        const forced = await sync(true);
        expect(forced.status).to.equal("success");
        for (const harness of HARNESSES)
            expect(await pathExists(dir(harness))).to.equal(false);
    });

    describe("global remote preparation", () => {
        const snapshotChecksum = async (id: string) => {
            const identity = createAgentSkillSourceIdentity({
                baseUrl: remote.baseUrl,
                tenantId: "7",
                userId: remote.userId
            });
            return (await loadAgentSkillSourceState(identity)).snapshot?.items[
                `user/${id}`
            ]?.checksum;
        };

        it("never substitutes cached v1 when v2 cannot be downloaded, even with --force", async () => {
            const v1 = await remote.publish("alpha", "v1");
            await remote.publish("beta", "v1");
            await sync();
            await fs.writeFile(
                path.join(dir("claude"), "SKILL.md"),
                skillMarkdown("alpha", "unpublished edit")
            );
            remote.remove("beta");
            const v2 = await remote.publish("alpha", "v2");
            remote.failDownloads.add("alpha");

            const forced = await sync(true);
            expect(forced.status).to.equal("failed");
            expect(forced.remoteSourceFailed).to.equal(true);
            expect(
                codes(forced, "DOWNLOAD_FAILED").map((i) => i.name)
            ).to.deep.equal(["alpha"]);
            // Nothing local changed: the edit, other copies and even the
            // remotely removed skill stay until a verified sync succeeds.
            expect(await readSkill(dir("claude"))).to.equal(
                skillMarkdown("alpha", "unpublished edit")
            );
            for (const harness of ["codex", "opencode", "dsh"] as Harness[]) {
                expect(await readSkill(dir(harness))).to.equal(
                    skillMarkdown("alpha", "v1")
                );
                expect(await pathExists(dir(harness, "beta"))).to.equal(true);
            }
            // The prior complete snapshot is retained; v2 is not recorded.
            expect(await snapshotChecksum(v1.meta.id)).to.equal(
                v1.meta.checksum
            );
            expect(await snapshotChecksum(v1.meta.id)).to.not.equal(
                v2.meta.checksum
            );

            remote.failDownloads.clear();
            const retried = await sync(true);
            expect(retried.status).to.equal("success");
            expect(await readSkill(dir("claude"))).to.equal(
                skillMarkdown("alpha", "v2")
            );
        });

        it("stops on a manifest outage, a material warning or an invalid ZIP", async () => {
            await remote.publish("alpha", "v1");
            await sync();
            remote.failManifest = true;
            expect((await sync(true)).status).to.equal("failed");
            remote.failManifest = false;

            remote.remove("alpha");
            remote.warnings = [
                { sourceKind: "own-user-publication", code: "READ_DENIED" }
            ];
            const warned = await sync(true);
            expect(warned.status).to.equal("failed");
            expect(warned.remoteSourceFailed).to.equal(true);
            for (const harness of HARNESSES)
                expect(await pathExists(dir(harness))).to.equal(true);

            remote.warnings = [];
            const v2 = await remote.publish("alpha", "v2");
            // The archive bytes no longer match the manifest checksum.
            remote.items.set(v2.meta.id, {
                meta: v2.meta,
                bytes: (await remote.publish("alpha", "tampered")).archive.bytes
            });
            remote.items.get(v2.meta.id)!.meta = v2.meta;
            const invalid = await sync(true);
            expect(invalid.status).to.equal("failed");
            for (const harness of HARNESSES)
                expect(await readSkill(dir(harness))).to.equal(
                    skillMarkdown("alpha", "v1")
                );
        });

        it("reuses a checksum-identical cached ZIP instead of downloading again", async () => {
            await remote.publish("alpha", "v1");
            await sync();
            const downloads = remote.downloads;
            await fs.rm(dir("codex"), { recursive: true });
            expect((await sync()).status).to.equal("success");
            expect(remote.downloads).to.equal(downloads);
            expect(await readSkill(dir("codex"))).to.equal(
                skillMarkdown("alpha", "v1")
            );
        });
    });

    it("keeps successful harness updates when a later harness fails, then converges", async () => {
        await remote.publish("alpha", "v1");
        await sync();
        await remote.publish("alpha", "v2");
        agentSkillReconcileTestHooks.beforeOperation = async (
            _kind,
            harness
        ) => {
            if (harness === "codex")
                throw new Error("EIO: simulated disk error");
        };

        const partial = await sync();
        expect(partial.status).to.equal("partial");
        expect(
            partial.items
                .filter((item) => item.name === "alpha")
                .map((item) => `${item.harness}:${item.action}`)
                .sort()
        ).to.deep.equal([
            "claude:updated",
            "codex:failed",
            "dsh:updated",
            "opencode:updated"
        ]);
        expect(partial.conflicts).to.deep.include({
            name: "alpha",
            harness: "codex",
            path: dir("codex"),
            reason: "OPERATION_FAILED",
            detail: "EIO: simulated disk error",
            remedy: partial.conflicts![0].remedy
        });
        expect(await readSkill(dir("claude"))).to.equal(
            skillMarkdown("alpha", "v2")
        );
        expect(await readSkill(dir("codex"))).to.equal(
            skillMarkdown("alpha", "v1")
        );

        delete agentSkillReconcileTestHooks.beforeOperation;
        const converged = await sync();
        expect(converged.status).to.equal("success");
        expect(converged.counts).to.deep.include({ updated: 1, unchanged: 3 });
    });

    describe("per-skill crash recovery", () => {
        it("restores the old copy after a crash between backup and replacement", async () => {
            await remote.publish("alpha", "v1");
            await sync();
            await remote.publish("alpha", "v2");
            agentSkillReconcileTestHooks.afterBackup = async () => {
                throw crash();
            };
            try {
                await sync();
            } catch (error) {
                expect((error as Error).message).to.equal("simulated crash");
            }
            delete agentSkillReconcileTestHooks.afterBackup;
            expect(await pathExists(dir("claude"))).to.equal(false);

            const recovered = await sync();
            expect(recovered.status).to.equal("success");
            expect(codes(recovered, "RECOVERED_RESTORED")).to.have.length(1);
            for (const harness of HARNESSES)
                expect(await readSkill(dir(harness))).to.equal(
                    skillMarkdown("alpha", "v2")
                );
            expect(
                await pathExists(path.join(env.roots.claude, STAGING_DIRECTORY))
            ).to.equal(false);
        });

        it("retains the backup when the new tree has the right id but incomplete content", async () => {
            await remote.publish("alpha", "v1");
            await sync();
            const staging = path.join(env.roots.claude, STAGING_DIRECTORY);
            const operation = path.join(staging, "op-partial");
            await fs.mkdir(path.join(operation, "old"), { recursive: true });
            await fs.writeFile(
                path.join(operation, "old", "SKILL.md"),
                "the only good copy"
            );
            await fs.writeFile(
                path.join(operation, "operation.json"),
                JSON.stringify({
                    version: 1,
                    kind: "replace",
                    name: "alpha",
                    newInstallationId: (await readMarker(dir("claude")))
                        .installationId
                })
            );
            // The final tree carries the expected id but lost content.
            await fs.writeFile(path.join(dir("claude"), "SKILL.md"), "trunc");

            const result = await sync();
            const retained = result.conflicts!.find(
                (c) => c.reason === "RECOVERY_RETAINED"
            )!;
            expect(retained.path).to.equal(path.join(operation, "old"));
            expect(retained.detail).to.include("incomplete or corrupted");
            expect(
                await fs.readFile(
                    path.join(operation, "old", "SKILL.md"),
                    "utf8"
                )
            ).to.equal("the only good copy");
        });

        it("keeps the backup when the skill path becomes occupied mid-replacement", async () => {
            await remote.publish("alpha", "v1");
            await sync();
            await fs.writeFile(path.join(dir("claude"), "notes.md"), "my edit");
            await remote.publish("alpha", "v2");
            let first = true;
            agentSkillReconcileTestHooks.afterBackup = async () => {
                if (!first) return;
                first = false;
                // Another process creates a file at the skill path.
                await fs.writeFile(dir("claude"), "intruder");
            };
            const result = await sync(true);
            delete agentSkillReconcileTestHooks.afterBackup;
            expect(result.status).to.equal("partial");
            expect(
                result.conflicts!.map((c) => [c.harness, c.reason])
            ).to.deep.equal([["claude", "OPERATION_FAILED"]]);

            await fs.rm(dir("claude"));
            await fs.writeFile(dir("claude"), "still occupied");
            const next = await sync();
            const retained = next.conflicts!.find(
                (c) => c.reason === "RECOVERY_RETAINED"
            )!;
            expect(
                await fs.readFile(path.join(retained.path, "notes.md"), "utf8")
            ).to.equal("my edit");
        });

        it("drops the backup after a completed replacement and retains an ambiguous one", async () => {
            await remote.publish("alpha", "v1");
            await remote.publish("beta", "v1");
            await sync();
            const staging = path.join(env.roots.claude, STAGING_DIRECTORY);
            const completed = path.join(staging, "op-completed");
            await fs.mkdir(path.join(completed, "old"), { recursive: true });
            await fs.writeFile(
                path.join(completed, "old", "SKILL.md"),
                "previous version"
            );
            await fs.writeFile(
                path.join(completed, "operation.json"),
                JSON.stringify({
                    version: 1,
                    kind: "replace",
                    name: "alpha",
                    newInstallationId: (await readMarker(dir("claude")))
                        .installationId
                })
            );
            const ambiguous = path.join(staging, "op-ambiguous");
            await fs.mkdir(path.join(ambiguous, "old"), { recursive: true });
            await fs.writeFile(
                path.join(ambiguous, "old", "SKILL.md"),
                "user data"
            );
            await fs.writeFile(
                path.join(ambiguous, "operation.json"),
                JSON.stringify({
                    version: 1,
                    kind: "replace",
                    name: "beta",
                    newInstallationId: "11111111-1111-4111-8111-111111111111"
                })
            );
            const unidentified = path.join(staging, "op-unknown");
            await fs.mkdir(path.join(unidentified, "old"), { recursive: true });

            const result = await sync();
            expect(result.status).to.equal("partial");
            expect(codes(result, "RECOVERED_COMPLETED")).to.have.length(1);
            expect(await pathExists(completed)).to.equal(false);
            expect(
                result.conflicts!.map((c) => [c.reason, c.path]).sort()
            ).to.deep.equal([
                ["RECOVERY_RETAINED", path.join(ambiguous, "old")],
                ["RECOVERY_RETAINED", path.join(unidentified, "old")]
            ]);
            expect(
                await fs.readFile(
                    path.join(ambiguous, "old", "SKILL.md"),
                    "utf8"
                )
            ).to.equal("user data");
        });
    });

    describe("unsafe paths", () => {
        it("refuses a symlinked skill directory even with --force", async () => {
            await remote.publish("alpha", "v1");
            const outside = path.join(env.tmp, "outside");
            await fs.mkdir(outside);
            await fs.writeFile(path.join(outside, "SKILL.md"), "precious");
            await fs.mkdir(env.roots.claude, { recursive: true });
            await fs.symlink(outside, dir("claude"));

            const forced = await sync(true);
            expect(forced.status).to.equal("partial");
            expect(
                forced.conflicts!.map((c) => [c.harness, c.detail])
            ).to.deep.equal([["claude", "symbolic link"]]);
            expect((await fs.lstat(dir("claude"))).isSymbolicLink()).to.equal(
                true
            );
            expect(
                await fs.readFile(path.join(outside, "SKILL.md"), "utf8")
            ).to.equal("precious");
            // Other harnesses are independent and still installed.
            expect(await readSkill(dir("codex"))).to.equal(
                skillMarkdown("alpha", "v1")
            );
        });

        it("refuses nested links, special files, symlinked roots and reserved names", async () => {
            await remote.publish("alpha", "v1");
            await sync();
            await fs.symlink("/etc", path.join(dir("codex"), "escape"));
            execFileSync("/usr/bin/mkfifo", [path.join(dir("dsh"), "pipe.md")]);
            const realOpencode = path.join(env.tmp, "real-opencode");
            await fs.rename(env.roots.opencode, realOpencode);
            await fs.symlink(realOpencode, env.roots.opencode);
            const reserved = path.join(env.roots.claude, "magda-mgd");
            await fs.mkdir(reserved);
            await fs.writeFile(path.join(reserved, "SKILL.md"), "bundled");
            const marker = await readMarker(dir("claude"));
            await fs.writeFile(
                path.join(reserved, AGENT_SKILL_INSTALL_MARKER),
                JSON.stringify({
                    ...marker,
                    name: "magda-mgd",
                    source: {
                        ...marker.source,
                        id: `agent-skill-${remote.userId}-magda-mgd`
                    }
                })
            );
            remote.remove("alpha");

            const forced = await sync(true);
            expect(
                forced
                    .conflicts!.map((c) => `${c.harness}:${c.name}:${c.reason}`)
                    .sort()
            ).to.deep.equal([
                "claude:magda-mgd:UNSAFE_PATH",
                "codex:alpha:UNSAFE_PATH",
                "dsh:alpha:UNSAFE_PATH",
                "opencode:*:UNSAFE_PATH"
            ]);
            expect(await readSkill(reserved)).to.equal("bundled");
            expect(
                (
                    await fs.lstat(path.join(dir("codex"), "escape"))
                ).isSymbolicLink()
            ).to.equal(true);
            // The safe, recognized, clean copy is still removed.
            expect(await pathExists(dir("claude"))).to.equal(false);
        });

        it("treats a marker naming an unverified account as ambiguous", async () => {
            await remote.publish("alpha", "v1");
            await sync();
            const marker = await readMarker(dir("claude"));
            await fs.writeFile(
                path.join(dir("claude"), AGENT_SKILL_INSTALL_MARKER),
                JSON.stringify({ ...marker, sourceKey: "9".repeat(64) })
            );
            remote.remove("alpha");
            const normal = await sync();
            expect(
                normal.conflicts!.map((c) => [c.harness, c.reason])
            ).to.deep.equal([["claude", "UNVERIFIED_SOURCE"]]);
            expect(await pathExists(dir("claude"))).to.equal(true);
            expect((await sync(true)).status).to.equal("success");
            expect(await pathExists(dir("claude"))).to.equal(false);
        });
    });

    describe("Workspace Sandbox target", () => {
        let root: string;
        const wsync = (
            force = false,
            type: "all" | "system" | "user" = "all"
        ) => syncWorkspaceAgentSkills(remote.client(), type, force);

        beforeEach(async () => {
            root = path.join(env.tmp, "dsh", "skills");
            await fs.mkdir(path.join(root, "magda-mgd"), { recursive: true });
            await fs.writeFile(
                path.join(root, "magda-mgd", "SKILL.md"),
                "bundled"
            );
            await remote.publish(
                "system-guide",
                "system v1",
                { "scripts/run.sh": "#!/bin/sh\n" },
                "system"
            );
            await remote.publish("alpha", "user v1");
        });

        it("bootstraps a fresh Sandbox with force into the single DSH root", async () => {
            const result = await wsync(true);
            expect(result.status).to.equal("success");
            expect(result.counts.installed).to.equal(2);
            expect(
                (await readMarker(path.join(root, "system-guide"))).source.kind
            ).to.equal("system-publication");
            expect(
                await fs.readFile(
                    path.join(root, "magda-mgd", "SKILL.md"),
                    "utf8"
                )
            ).to.equal("bundled");
            expect(await pathExists(env.roots.claude)).to.equal(false);
        });

        it("uses the same ordinary and forced semantics as local sync", async () => {
            await wsync(true);
            await fs.rm(path.join(root, "alpha"), { recursive: true });
            await fs.rm(
                path.join(root, "system-guide", AGENT_SKILL_INSTALL_MARKER)
            );
            const ordinary = await wsync();
            expect(ordinary.status).to.equal("success");
            expect(ordinary.counts.installed).to.equal(1);
            expect(codes(ordinary, "ADOPTED")).to.have.length(1);

            await fs.writeFile(
                path.join(root, "alpha", "SKILL.md"),
                skillMarkdown("alpha", "sandbox edit")
            );
            await remote.publish("system-guide", "system v2", {}, "system");
            const conflicted = await wsync();
            expect(conflicted.status).to.equal("partial");
            // The user-skill conflict does not hold back the system update.
            expect(await readSkill(path.join(root, "system-guide"))).to.equal(
                skillMarkdown("system-guide", "system v2")
            );
            expect(await readSkill(path.join(root, "alpha"))).to.equal(
                skillMarkdown("alpha", "sandbox edit")
            );
            const forced = await wsync(true);
            expect(forced.status).to.equal("success");
            expect(await readSkill(path.join(root, "alpha"))).to.equal(
                skillMarkdown("alpha", "user v1")
            );
            expect(await readSkill(path.join(root, "system-guide"))).to.equal(
                skillMarkdown("system-guide", "system v2")
            );
        });

        it("stops a forced Sandbox sync before any change when a required download fails", async () => {
            await wsync(true);
            await fs.writeFile(
                path.join(root, "alpha", "SKILL.md"),
                skillMarkdown("alpha", "sandbox edit")
            );
            await remote.publish("system-guide", "system v2", {}, "system");
            remote.failDownloads.add("system-guide");
            const result = await wsync(true);
            expect(result.status).to.equal("failed");
            expect(result.remoteSourceFailed).to.equal(true);
            expect(await readSkill(path.join(root, "alpha"))).to.equal(
                skillMarkdown("alpha", "sandbox edit")
            );
            expect(await readSkill(path.join(root, "system-guide"))).to.equal(
                skillMarkdown("system-guide", "system v1")
            );
        });

        it("leaves publications outside a selected --type untouched", async () => {
            await wsync(true);
            remote.remove("alpha");
            expect((await wsync(false, "system")).status).to.equal("success");
            expect(await pathExists(path.join(root, "alpha"))).to.equal(true);
            expect((await wsync(false, "user")).counts.removed).to.equal(1);
            expect(await pathExists(path.join(root, "alpha"))).to.equal(false);
            expect(await pathExists(path.join(root, "system-guide"))).to.equal(
                true
            );
        });
    });
});
