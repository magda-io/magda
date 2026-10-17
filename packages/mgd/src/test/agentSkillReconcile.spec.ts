import { expect } from "chai";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { AGENT_SKILL_INSTALL_MARKER } from "../agentSkillArchive.js";
import {
    createAgentSkillSourceIdentity,
    loadAgentSkillInstallationIndex,
    loadAgentSkillSourceState,
    markerMatchesInstallation,
    saveAgentSkillInstallationIndex,
    installationKey
} from "../agentSkillLocalState.js";
import {
    agentSkillOperationJournalPath,
    agentSkillReconcileTestHooks,
    STAGING_DIRECTORY
} from "../agentSkillReconcile.js";
import {
    recoverAgentSkillOperations,
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

function codes(result: AgentSkillSyncResult, code: string) {
    return result.items.filter((item) => item.code === code);
}

describe("copy-only Agent Skill reconciliation", () => {
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
        delete agentSkillReconcileTestHooks.afterOperation;
        delete agentSkillReconcileTestHooks.afterIndexCommit;
        await env.restore();
    });

    it("installs an independent real-directory copy with metadata in every harness", async () => {
        const { meta } = await remote.publish("alpha", "v1", {
            "reference.md": "# Reference\n"
        });
        const result = await sync();
        expect(result.status).to.equal("success");
        expect(result.counts.installed).to.equal(4);
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
            expect(
                await fs.readFile(
                    path.join(dir(harness), "reference.md"),
                    "utf8"
                )
            ).to.equal("# Reference\n");
            const marker = await readMarker(dir(harness));
            expect(marker).to.include({
                format: "magda-agent-skill-installation",
                version: 1,
                sourceKey: identity.key,
                name: "alpha",
                baselineChecksum: meta.checksum
            });
            expect(marker.source).to.deep.equal({
                type: "user",
                id: meta.id,
                kind: "own-user-publication"
            });
            expect(JSON.stringify(marker)).not.to.match(/apiKey|secret/i);
            ids.add(marker.installationId);
        }
        expect(ids.size).to.equal(4);
        const index = await loadAgentSkillInstallationIndex();
        expect(Object.keys(index.installations)).to.have.length(4);
        expect(index.activeSourceKey).to.equal(identity.key);

        // Copies are independent: editing one never changes another.
        await fs.writeFile(
            path.join(dir("claude"), "SKILL.md"),
            skillMarkdown("alpha", "edited")
        );
        expect(await readSkill(dir("codex"))).to.equal(
            skillMarkdown("alpha", "v1")
        );
        // No staging or journal is left behind after a successful commit.
        for (const harness of HARNESSES)
            expect(
                await pathExists(
                    path.join(env.roots[harness], STAGING_DIRECTORY)
                )
            ).to.equal(false);
        expect(await pathExists(agentSkillOperationJournalPath())).to.equal(
            false
        );
    });

    it("reinstalls a manually deleted installation on ordinary sync", async () => {
        await remote.publish("alpha", "v1");
        await sync();
        await fs.rm(dir("codex"), { recursive: true });

        const result = await sync();
        expect(result.status).to.equal("success");
        expect(result.blocked).to.equal(undefined);
        expect(
            codes(result, "REINSTALLED").map((item) => item.harness)
        ).to.deep.equal(["codex"]);
        expect(await readSkill(dir("codex"))).to.equal(
            skillMarkdown("alpha", "v1")
        );
        expect(result.counts.unchanged).to.equal(3);
    });

    it("forgets a deleted installation whose publication was removed", async () => {
        await remote.publish("alpha", "v1");
        await sync();
        await fs.rm(dir("claude"), { recursive: true });
        remote.remove("alpha");

        const result = await sync();
        expect(result.status).to.equal("success");
        expect(
            codes(result, "TRACKING_CLEARED").map((i) => i.harness)
        ).to.deep.equal(["claude"]);
        expect(result.counts.removed).to.equal(4);
        for (const harness of HARNESSES)
            expect(await pathExists(dir(harness))).to.equal(false);
        expect(
            (await loadAgentSkillInstallationIndex()).installations
        ).to.deep.equal({});
    });

    it("repairs missing, malformed and stale metadata only when the full tree matches", async () => {
        const { meta } = await remote.publish("alpha", "v1");
        await sync();
        const markerPath = (harness: Harness) =>
            path.join(dir(harness), AGENT_SKILL_INSTALL_MARKER);
        await fs.rm(markerPath("claude"));
        await fs.writeFile(markerPath("codex"), "{not json");
        const stale = await readMarker(dir("opencode"));
        stale.baselineChecksum = "f".repeat(64);
        await fs.writeFile(markerPath("opencode"), JSON.stringify(stale));
        const before = await Promise.all(
            ["claude", "codex", "opencode"].map((harness) =>
                fs.stat(path.join(dir(harness as Harness), "SKILL.md"))
            )
        );

        const result = await sync();
        expect(result.status).to.equal("success");
        expect(
            codes(result, "METADATA_REPAIRED")
                .map((item) => item.harness)
                .sort()
        ).to.deep.equal(["claude", "codex", "opencode"]);
        const index = await loadAgentSkillInstallationIndex();
        for (const [position, harness] of ([
            "claude",
            "codex",
            "opencode"
        ] as Harness[]).entries()) {
            const after = await fs.stat(path.join(dir(harness), "SKILL.md"));
            // Skill content files are left untouched; only metadata changes.
            expect(after.ino).to.equal(before[position].ino);
            expect(after.mtimeMs).to.equal(before[position].mtimeMs);
            const installation =
                index.installations[
                    installationKey(env.roots[harness], "alpha")
                ];
            expect(installation.baselineChecksum).to.equal(meta.checksum);
            expect(
                markerMatchesInstallation(
                    await fs.readFile(markerPath(harness)),
                    installation
                )
            ).to.equal(true);
        }
    });

    it("never adopts a matching SKILL.md alone: other content conflicts until --force", async () => {
        await remote.publish("alpha", "v1");
        await sync();
        await fs.rm(path.join(dir("claude"), AGENT_SKILL_INSTALL_MARKER));
        await fs.writeFile(path.join(dir("claude"), "extra.md"), "# Mine\n");
        const indexBefore = await loadAgentSkillInstallationIndex();

        const normal = await sync();
        expect(normal.status).to.equal("partial");
        expect(normal.blocked).to.equal(true);
        expect(normal.conflicts).to.deep.equal([
            {
                name: "alpha",
                harness: "claude",
                path: dir("claude"),
                reason: "UNRECOGNIZED_DIRECTORY",
                detail: "installation metadata is missing",
                remedy: normal.conflicts![0].remedy
            }
        ]);
        expect(await pathExists(path.join(dir("claude"), "extra.md"))).to.equal(
            true
        );
        expect(await loadAgentSkillInstallationIndex()).to.deep.equal(
            indexBefore
        );

        const forced = await sync(true);
        expect(forced.status).to.equal("success");
        expect(
            codes(forced, "FORCED_REPLACE").map((i) => i.path)
        ).to.deep.equal([dir("claude")]);
        expect(await pathExists(path.join(dir("claude"), "extra.md"))).to.equal(
            false
        );
        expect(await readMarker(dir("claude"))).to.have.property(
            "installationId"
        );
    });

    it("updates an older clean copy, but treats a genuine edit as a conflict", async () => {
        await remote.publish("alpha", "v1");
        await sync();
        await remote.publish("alpha", "v2");

        const updated = await sync();
        expect(updated.status).to.equal("success");
        expect(updated.counts.updated).to.equal(4);
        for (const harness of HARNESSES)
            expect(await readSkill(dir(harness))).to.equal(
                skillMarkdown("alpha", "v2")
            );

        await fs.writeFile(
            path.join(dir("codex"), "SKILL.md"),
            skillMarkdown("alpha", "my codex edit")
        );
        await remote.publish("alpha", "v3");
        const blocked = await sync();
        expect(blocked.blocked).to.equal(true);
        expect(
            blocked.conflicts!.map((c) => [c.harness, c.reason])
        ).to.deep.equal([["codex", "LOCAL_MODIFICATION"]]);
        // No destructive partial update while any conflict is unresolved.
        for (const harness of ["claude", "opencode", "dsh"] as Harness[])
            expect(await readSkill(dir(harness))).to.equal(
                skillMarkdown("alpha", "v2")
            );

        const forced = await sync(true);
        expect(forced.status).to.equal("success");
        for (const harness of HARNESSES)
            expect(await readSkill(dir(harness))).to.equal(
                skillMarkdown("alpha", "v3")
            );
    });

    it("reports every conflicting harness before changing anything", async () => {
        await remote.publish("alpha", "v1");
        await remote.publish("beta", "v1");
        await sync();
        await fs.writeFile(
            path.join(dir("claude"), "SKILL.md"),
            skillMarkdown("alpha", "claude edit")
        );
        await fs.writeFile(path.join(dir("opencode", "beta"), "added.md"), "x");
        await remote.publish("alpha", "v2");
        await remote.publish("gamma", "new");
        const indexBefore = await loadAgentSkillInstallationIndex();

        const result = await sync();
        expect(result.blocked).to.equal(true);
        expect(
            result.conflicts!.map((c) => `${c.harness}:${c.name}`).sort()
        ).to.deep.equal(["claude:alpha", "opencode:beta"]);
        expect(result.counts.installed + result.counts.updated).to.equal(0);
        expect(await readSkill(dir("codex"))).to.equal(
            skillMarkdown("alpha", "v1")
        );
        expect(await pathExists(dir("dsh", "gamma"))).to.equal(false);
        expect(await loadAgentSkillInstallationIndex()).to.deep.equal(
            indexBefore
        );
        // The verified remote snapshot is still recorded (no network-derived
        // resurrection later), even though installations were not changed.
        const identity = createAgentSkillSourceIdentity({
            baseUrl: remote.baseUrl,
            tenantId: "7",
            userId: remote.userId
        });
        const snapshot = (await loadAgentSkillSourceState(identity)).snapshot!;
        expect(Object.keys(snapshot.items)).to.have.length(3);
    });

    it("ignores unrelated names and adopts or conflicts on unfamiliar matching names", async () => {
        await remote.publish("alpha", "v1");
        const unrelated = path.join(env.roots.claude, "my-own");
        await fs.mkdir(unrelated, { recursive: true });
        await fs.writeFile(
            path.join(unrelated, "SKILL.md"),
            skillMarkdown("my-own", "mine")
        );
        await fs.mkdir(dir("codex"), { recursive: true });
        await fs.writeFile(
            path.join(dir("codex"), "SKILL.md"),
            skillMarkdown("alpha", "v1")
        );
        await fs.mkdir(dir("opencode"), { recursive: true });
        await fs.writeFile(
            path.join(dir("opencode"), "SKILL.md"),
            skillMarkdown("alpha", "independently authored")
        );

        const normal = await sync();
        expect(normal.blocked).to.equal(true);
        expect(
            normal.conflicts!.map((c) => [c.harness, c.reason])
        ).to.deep.equal([["opencode", "UNRECOGNIZED_DIRECTORY"]]);

        const forced = await sync(true);
        expect(forced.status).to.equal("success");
        expect(codes(forced, "ADOPTED").map((i) => i.harness)).to.deep.equal([
            "codex"
        ]);
        expect(
            codes(forced, "FORCED_REPLACE").map((i) => i.harness)
        ).to.deep.equal(["opencode"]);
        expect(await readSkill(unrelated)).to.equal(
            skillMarkdown("my-own", "mine")
        );
        expect(
            await pathExists(path.join(unrelated, AGENT_SKILL_INSTALL_MARKER))
        ).to.equal(false);
    });

    it("refuses a symlinked skill directory even with --force", async () => {
        await remote.publish("alpha", "v1");
        const outside = path.join(env.tmp, "outside");
        await fs.mkdir(outside);
        await fs.writeFile(path.join(outside, "SKILL.md"), "precious");
        await fs.mkdir(env.roots.claude, { recursive: true });
        await fs.symlink(outside, dir("claude"));

        const forced = await sync(true);
        expect(forced.status).to.equal("failed");
        expect(forced.blocked).to.equal(true);
        expect(
            forced.conflicts!.map((c) => [c.harness, c.detail])
        ).to.deep.equal([["claude", "symbolic link"]]);
        expect((await fs.lstat(dir("claude"))).isSymbolicLink()).to.equal(true);
        expect(
            await fs.readFile(path.join(outside, "SKILL.md"), "utf8")
        ).to.equal("precious");
        // Unsafe paths block every harness, not only the unsafe one.
        expect(await pathExists(dir("codex"))).to.equal(false);
    });

    it("refuses nested links, special files, symlinked roots and reserved names even with --force", async () => {
        await remote.publish("alpha", "v1");
        await sync();
        await fs.symlink("/etc", path.join(dir("codex"), "escape"));
        execFileSync("/usr/bin/mkfifo", [path.join(dir("dsh"), "pipe.md")]);
        const realOpencode = path.join(env.tmp, "real-opencode");
        await fs.rename(env.roots.opencode, realOpencode);
        await fs.symlink(realOpencode, env.roots.opencode);
        const index = await loadAgentSkillInstallationIndex();
        const reserved = path.join(env.roots.claude, "magda-mgd");
        await fs.mkdir(reserved);
        await fs.writeFile(path.join(reserved, "SKILL.md"), "bundled");
        const template =
            index.installations[installationKey(env.roots.claude, "alpha")];
        index.installations[installationKey(env.roots.claude, "magda-mgd")] = {
            ...template,
            installationId: "11111111-1111-4111-8111-111111111111",
            name: "magda-mgd",
            path: reserved
        };
        await saveAgentSkillInstallationIndex(index);
        remote.remove("alpha");

        const forced = await sync(true);
        expect(forced.blocked).to.equal(true);
        expect(
            forced.conflicts!.map((c) => `${c.harness}:${c.name}`).sort()
        ).to.deep.equal([
            "claude:magda-mgd",
            "codex:alpha",
            "dsh:alpha",
            "opencode:alpha"
        ]);
        expect(
            forced.conflicts!.every((c) => c.reason === "UNSAFE_PATH")
        ).to.equal(true);
        expect(await readSkill(reserved)).to.equal("bundled");
        expect(await pathExists(dir("claude"))).to.equal(true);
        expect(
            (await fs.lstat(path.join(dir("codex"), "escape"))).isSymbolicLink()
        ).to.equal(true);
    });

    it("keeps installations and the verified cache when a download fails", async () => {
        const first = await remote.publish("alpha", "v1");
        await sync();
        await remote.publish("alpha", "v2");
        await remote.publish("beta", "new");
        remote.failDownloads.add("alpha");
        remote.failDownloads.add("beta");

        const result = await sync();
        expect(result.status).to.equal("failed");
        expect(codes(result, "DOWNLOAD_FAILED")).to.have.length(2);
        for (const harness of HARNESSES) {
            expect(await readSkill(dir(harness))).to.equal(
                skillMarkdown("alpha", "v1")
            );
            expect(await pathExists(dir(harness, "beta"))).to.equal(false);
        }
        const identity = createAgentSkillSourceIdentity({
            baseUrl: remote.baseUrl,
            tenantId: "7",
            userId: remote.userId
        });
        const item = (await loadAgentSkillSourceState(identity)).snapshot!
            .items[`user/${first.meta.id}`];
        expect(item.checksum).to.equal(first.meta.checksum);
        expect(await pathExists(item.archiveFile)).to.equal(true);
    });

    it("changes nothing during a manifest outage and never deletes on warnings", async () => {
        await remote.publish("alpha", "v1");
        await sync();
        const indexBefore = await loadAgentSkillInstallationIndex();
        remote.failManifest = true;
        expect((await sync()).status).to.equal("failed");
        expect(await loadAgentSkillInstallationIndex()).to.deep.equal(
            indexBefore
        );

        remote.failManifest = false;
        remote.remove("alpha");
        remote.warnings = [
            { sourceKind: "own-user-publication", code: "READ_DENIED" }
        ];
        const warned = await sync();
        expect(warned.status).to.equal("partial");
        expect(codes(warned, "SOURCE_UNRESOLVED")).to.have.length(4);
        for (const harness of HARNESSES)
            expect(await pathExists(dir(harness))).to.equal(true);
    });

    it("removes clean copies of a deleted publication; modified ones need --force", async () => {
        await remote.publish("alpha", "v1");
        await sync();
        await fs.writeFile(
            path.join(dir("dsh"), "SKILL.md"),
            skillMarkdown("alpha", "dsh edit")
        );
        remote.remove("alpha");

        const normal = await sync();
        expect(normal.blocked).to.equal(true);
        expect(
            normal.conflicts!.map((c) => [c.harness, c.reason])
        ).to.deep.equal([["dsh", "REMOVED_REMOTE_LOCAL_MODIFICATION"]]);
        for (const harness of HARNESSES)
            expect(await pathExists(dir(harness))).to.equal(true);

        const forced = await sync(true);
        expect(forced.status).to.equal("success");
        expect(forced.counts.removed).to.equal(4);
        for (const harness of HARNESSES)
            expect(await pathExists(dir(harness))).to.equal(false);
    });

    describe("interrupted commits", () => {
        const crash = () => {
            const error = new Error("simulated crash") as Error & {
                simulatedCrash: boolean;
            };
            error.simulatedCrash = true;
            return error;
        };

        it("rolls back a replacement interrupted after the old copy moved aside", async () => {
            await remote.publish("alpha", "v1");
            await sync();
            const indexBefore = await loadAgentSkillInstallationIndex();
            await remote.publish("alpha", "v2");
            agentSkillReconcileTestHooks.afterOperation = async (
                kind,
                state
            ) => {
                if (kind === "replace" && state === "oldMoved") throw crash();
            };
            let caught: unknown;
            try {
                await sync();
            } catch (error) {
                caught = error;
            }
            expect((caught as Error).message).to.equal("simulated crash");
            delete agentSkillReconcileTestHooks.afterOperation;
            expect(await pathExists(agentSkillOperationJournalPath())).to.equal(
                true
            );
            expect(await pathExists(dir("claude"))).to.equal(false);

            await recoverAgentSkillOperations();
            expect(await pathExists(agentSkillOperationJournalPath())).to.equal(
                false
            );
            for (const harness of HARNESSES) {
                expect(await readSkill(dir(harness))).to.equal(
                    skillMarkdown("alpha", "v1")
                );
                expect(
                    await pathExists(
                        path.join(env.roots[harness], STAGING_DIRECTORY)
                    )
                ).to.equal(false);
            }
            expect(await loadAgentSkillInstallationIndex()).to.deep.equal(
                indexBefore
            );
            // The next ordinary sync completes the update normally.
            expect((await sync()).counts.updated).to.equal(4);
        });

        it("rolls back several completed operations and an interrupted deletion", async () => {
            await remote.publish("alpha", "v1");
            await sync();
            remote.remove("alpha");
            let completed = 0;
            agentSkillReconcileTestHooks.afterOperation = async (
                kind,
                state
            ) => {
                if (kind === "remove" && state === "done" && ++completed === 2)
                    throw crash();
            };
            try {
                await sync();
            } catch {
                // simulated crash
            }
            delete agentSkillReconcileTestHooks.afterOperation;
            await recoverAgentSkillOperations();
            for (const harness of HARNESSES)
                expect(await readSkill(dir(harness))).to.equal(
                    skillMarkdown("alpha", "v1")
                );
            // Removal intent survives: the verified snapshot already lacks it.
            const result = await sync();
            expect(result.counts.removed).to.equal(4);
        });

        it("rolls forward the profile config after the index commit point", async () => {
            await remote.publish("alpha", "v1");
            await sync();
            const {
                withAgentSkillOperationLock,
                activateCachedAgentSkillProfile
            } = await import("../agentSkillSync.js");
            agentSkillReconcileTestHooks.afterIndexCommit = async () => {
                throw crash();
            };
            try {
                await withAgentSkillOperationLock(() =>
                    activateCachedAgentSkillProfile({
                        profileName: "other",
                        force: false,
                        finalConfig: {
                            activeProfile: "other",
                            profiles: {
                                dev: { baseUrl: "https://dev.example/api" },
                                other: { baseUrl: "https://other.example/api" }
                            }
                        }
                    })
                );
            } catch {
                // simulated crash
            }
            delete agentSkillReconcileTestHooks.afterIndexCommit;
            const { loadConfig } = await import("../profile.js");
            expect((await loadConfig()).activeProfile).to.equal("dev");
            await recoverAgentSkillOperations();
            expect((await loadConfig()).activeProfile).to.equal("other");
            for (const harness of HARNESSES)
                expect(await pathExists(dir(harness))).to.equal(false);
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

        it("bootstraps a fresh Sandbox with force, leaving bundled skills untouched", async () => {
            const result = await wsync(true);
            expect(result.status).to.equal("success");
            expect(result.counts.installed).to.equal(2);
            expect(await readSkill(path.join(root, "system-guide"))).to.equal(
                skillMarkdown("system-guide", "system v1")
            );
            expect(
                (await readMarker(path.join(root, "alpha"))).source.kind
            ).to.equal("own-user-publication");
            expect(
                await fs.readFile(
                    path.join(root, "magda-mgd", "SKILL.md"),
                    "utf8"
                )
            ).to.equal("bundled");
            // Only the single Workspace root is a target.
            expect(await pathExists(env.roots.claude)).to.equal(false);
        });

        it("uses ordinary reconciliation for manual sync and explicit --force", async () => {
            await wsync(true);
            await fs.rm(path.join(root, "alpha"), { recursive: true });
            await fs.rm(
                path.join(root, "system-guide", AGENT_SKILL_INSTALL_MARKER)
            );
            const ordinary = await wsync();
            expect(ordinary.status).to.equal("success");
            expect(codes(ordinary, "REINSTALLED")).to.have.length(1);
            expect(codes(ordinary, "METADATA_REPAIRED")).to.have.length(1);

            await fs.writeFile(
                path.join(root, "alpha", "SKILL.md"),
                skillMarkdown("alpha", "sandbox edit")
            );
            await remote.publish("system-guide", "system v2", {}, "system");
            const blocked = await wsync();
            expect(blocked.blocked).to.equal(true);
            expect(await readSkill(path.join(root, "system-guide"))).to.equal(
                skillMarkdown("system-guide", "system v1")
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

        it("leaves publications outside a selected --type untouched", async () => {
            await wsync(true);
            remote.remove("alpha");
            const result = await wsync(false, "system");
            expect(result.status).to.equal("success");
            expect(await pathExists(path.join(root, "alpha"))).to.equal(true);
            expect((await wsync(false, "user")).counts.removed).to.equal(1);
            expect(await pathExists(path.join(root, "alpha"))).to.equal(false);
            expect(await pathExists(path.join(root, "system-guide"))).to.equal(
                true
            );
        });
    });
});
