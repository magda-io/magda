import { expect } from "chai";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AgentSkillClient } from "../agentSkillClient.js";
import {
    createAgentSkillArchive,
    extractAgentSkillArchive
} from "../agentSkillArchive.js";
import { loadAgentSkillState, stateKey } from "../agentSkillState.js";
import { syncAgentSkills } from "../agentSkillSync.js";
import type {
    AgentSkillMetadata,
    WorkspaceSkillManifest
} from "../agentSkillTypes.js";

const ref = { type: "user" as const, id: "publication-1" };
const skillMarkdown = (body: string) => `---
name: useful-skill
description: A useful test skill
---

# Useful skill

${body}
`;

function metadata(checksum: string): AgentSkillMetadata {
    return {
        ...ref,
        name: "useful-skill",
        description: "A useful test skill",
        userId: "u1",
        ownerId: "u1",
        createdAt: "2025-01-01T00:00:00.000Z",
        createdBy: "u1",
        updatedAt: "2025-01-01T00:00:00.000Z",
        updatedBy: "u1",
        checksum
    };
}

function manifest(source?: AgentSkillMetadata): WorkspaceSkillManifest {
    return {
        version: 1,
        complete: true,
        items: source
            ? [
                  {
                      selectionId: "selection-1",
                      effectiveName: source.name,
                      sourceKind: "own-user-publication",
                      source
                  }
              ]
            : [],
        warnings: []
    };
}

describe("Agent Skill sync", () => {
    let temporaryDirectory: string;
    let originalEnv: Record<string, string | undefined>;
    let managedRoot: string;

    beforeEach(async () => {
        temporaryDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), "mgd-agent-skill-sync-")
        );
        managedRoot = path.join(temporaryDirectory, "managed");
        originalEnv = {};
        for (const key of [
            "XDG_CONFIG_HOME",
            "MGD_AGENT_SKILL_DIR",
            "DSH_HOME"
        ]) {
            originalEnv[key] = process.env[key];
            delete process.env[key];
        }
        process.env.XDG_CONFIG_HOME = path.join(temporaryDirectory, "config");
        process.env.MGD_AGENT_SKILL_DIR = managedRoot;
    });

    afterEach(async () => {
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        await fs.rm(temporaryDirectory, { recursive: true, force: true });
    });

    async function archive(body: string) {
        const source = path.join(temporaryDirectory, `source-${randomUUID()}`);
        await fs.mkdir(source);
        await fs.writeFile(path.join(source, "SKILL.md"), skillMarkdown(body));
        return createAgentSkillArchive(source, "user");
    }

    function clientFor(
        source: AgentSkillMetadata | undefined,
        bytes?: Buffer,
        onDownload?: () => void
    ): AgentSkillClient {
        return ({
            manifest: async () => manifest(source),
            download: async () => {
                onDownload?.();
                if (!source || !bytes) throw new Error("unexpected download");
                return { metadata: source, bytes };
            }
        } as unknown) as AgentSkillClient;
    }

    it("installs, skips unchanged downloads, updates, and restores a missing projection", async () => {
        const firstArchive = await archive("First version");
        const first = metadata(firstArchive.archiveSha256);
        let downloads = 0;
        const installed = await syncAgentSkills(
            clientFor(first, firstArchive.bytes, () => downloads++)
        );
        expect(installed.status).to.equal("success");
        expect(installed.counts.installed).to.equal(1);
        expect(downloads).to.equal(1);

        const destination = path.join(managedRoot, first.name);
        expect(
            await fs.readFile(path.join(destination, "SKILL.md"), "utf8")
        ).to.equal(skillMarkdown("First version"));

        const unchanged = await syncAgentSkills(
            clientFor(first, undefined, () => downloads++)
        );
        expect(unchanged.counts.unchanged).to.equal(1);
        expect(downloads).to.equal(1);

        const secondArchive = await archive("Second version");
        const second = metadata(secondArchive.archiveSha256);
        const updated = await syncAgentSkills(
            clientFor(second, secondArchive.bytes, () => downloads++)
        );
        expect(updated.counts.updated).to.equal(1);
        expect(
            await fs.readFile(path.join(destination, "SKILL.md"), "utf8")
        ).to.equal(skillMarkdown("Second version"));

        await fs.rm(destination, { recursive: true, force: true });
        const restored = await syncAgentSkills(
            clientFor(second, secondArchive.bytes, () => downloads++)
        );
        expect(restored.counts.updated).to.equal(1);
        expect(downloads).to.equal(3);
        expect(
            await fs.readFile(path.join(destination, "SKILL.md"), "utf8")
        ).to.equal(skillMarkdown("Second version"));
    });

    it("skips remote updates when the managed copy has local changes", async () => {
        const firstArchive = await archive("First version");
        const first = metadata(firstArchive.archiveSha256);
        await syncAgentSkills(clientFor(first, firstArchive.bytes));
        const destination = path.join(managedRoot, first.name);
        await fs.writeFile(
            path.join(destination, "SKILL.md"),
            skillMarkdown("Local edit")
        );

        const secondArchive = await archive("Remote edit");
        const second = metadata(secondArchive.archiveSha256);
        let downloads = 0;
        const result = await syncAgentSkills(
            clientFor(second, secondArchive.bytes, () => downloads++)
        );
        expect(result.status).to.equal("partial");
        expect(result.items).to.deep.include({
            ref,
            name: first.name,
            action: "skipped",
            code: "LOCAL_CHANGES"
        });
        expect(downloads).to.equal(1);
        expect(
            await fs.readFile(path.join(destination, "SKILL.md"), "utf8")
        ).to.equal(skillMarkdown("Local edit"));
        expect(
            (await loadAgentSkillState()).entries[stateKey(ref)].remoteChecksum
        ).to.equal(first.checksum);
    });

    it("removes clean remote deletions and preserves locally changed deletions as drafts", async () => {
        const firstArchive = await archive("First version");
        const first = metadata(firstArchive.archiveSha256);
        await syncAgentSkills(clientFor(first, firstArchive.bytes));
        const destination = path.join(managedRoot, first.name);

        const removed = await syncAgentSkills(clientFor(undefined));
        expect(removed.counts.removed).to.equal(1);
        let destinationExists = true;
        try {
            await fs.stat(destination);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT")
                destinationExists = false;
            else throw error;
        }
        expect(destinationExists).to.equal(false);
        expect((await loadAgentSkillState()).entries[stateKey(ref)]).to.equal(
            undefined
        );

        await syncAgentSkills(clientFor(first, firstArchive.bytes));
        await fs.writeFile(
            path.join(destination, "SKILL.md"),
            skillMarkdown("Local edit")
        );
        const preserved = await syncAgentSkills(clientFor(undefined));
        expect(preserved.status).to.equal("partial");
        expect(preserved.items[0].code).to.equal(
            "DELETED_REMOTE_LOCAL_DRAFT_PRESERVED"
        );
        const state = await loadAgentSkillState();
        expect(state.entries[stateKey(ref)]).to.equal(undefined);
        const draftsRoot = path.join(managedRoot, ".local-drafts");
        const names = await fs.readdir(draftsRoot);
        const draftName = names.find((name) =>
            name.startsWith(`${first.name}-`)
        );
        expect(draftName).to.not.equal(undefined);
        const draftDirectory = path.join(draftsRoot, draftName!);
        expect(
            await fs.readFile(path.join(draftDirectory, "SKILL.md"), "utf8")
        ).to.equal(skillMarkdown("Local edit"));
        expect(state.drafts[draftDirectory]).to.deep.include({
            type: "user",
            name: first.name
        });
        expect(state.drafts[draftDirectory].ref).to.equal(undefined);
        expect(state.drafts[draftDirectory].baseChecksum).to.equal(undefined);
    });

    it("preserves absent managed copies when manifest warnings make absence non-authoritative", async () => {
        const firstArchive = await archive("First version");
        const first = metadata(firstArchive.archiveSha256);
        await syncAgentSkills(clientFor(first, firstArchive.bytes));
        const destination = path.join(managedRoot, first.name);
        const degradedManifest = manifest();
        degradedManifest.warnings = [
            {
                sourceKind: "own-user-publication",
                code: "SOURCE_RECORD_SKIPPED",
                recordId: first.id
            }
        ];

        const result = await syncAgentSkills(({
            manifest: async () => degradedManifest
        } as unknown) as AgentSkillClient);
        expect(result.status).to.equal("partial");
        expect(result.items).to.deep.include({
            ref,
            name: first.name,
            action: "skipped",
            code: "MANIFEST_WARNING_PRESERVED"
        });
        expect(
            await fs.readFile(path.join(destination, "SKILL.md"), "utf8")
        ).to.equal(skillMarkdown("First version"));
        expect(
            (await loadAgentSkillState()).entries[stateKey(ref)]
        ).to.not.equal(undefined);
    });

    it("adopts crash-orphaned installs and updates that match the remote tree", async () => {
        const firstArchive = await archive("First version");
        const first = metadata(firstArchive.archiveSha256);
        const destination = path.join(managedRoot, first.name);
        await extractAgentSkillArchive(firstArchive.bytes, "user", destination);

        const recoveredInstall = await syncAgentSkills(
            clientFor(first, firstArchive.bytes)
        );
        expect(recoveredInstall.counts.installed).to.equal(1);
        expect(
            (await loadAgentSkillState()).entries[stateKey(ref)].remoteChecksum
        ).to.equal(first.checksum);

        const secondArchive = await archive("Second version");
        const second = metadata(secondArchive.archiveSha256);
        await extractAgentSkillArchive(
            secondArchive.bytes,
            "user",
            destination
        );
        const recoveredUpdate = await syncAgentSkills(
            clientFor(second, secondArchive.bytes)
        );
        expect(recoveredUpdate.counts.updated).to.equal(1);
        expect(
            (await loadAgentSkillState()).entries[stateKey(ref)].remoteChecksum
        ).to.equal(second.checksum);
    });

    it("fails closed when the managed root is a symlink", async () => {
        const outside = path.join(temporaryDirectory, "outside");
        await fs.mkdir(outside);
        await fs.symlink(outside, managedRoot);
        const firstArchive = await archive("First version");
        let thrown: unknown;
        try {
            await syncAgentSkills(
                clientFor(
                    metadata(firstArchive.archiveSha256),
                    firstArchive.bytes
                )
            );
        } catch (error) {
            thrown = error;
        }
        expect((thrown as Error)?.message).to.include("real directory");
        expect(await fs.readdir(outside)).to.deep.equal([]);
    });

    it("reports failed when every selected archive fails", async () => {
        const firstArchive = await archive("First version");
        const first = metadata(firstArchive.archiveSha256);
        const result = await syncAgentSkills(({
            manifest: async () => manifest(first),
            download: async () => {
                throw new Error("storage unavailable");
            }
        } as unknown) as AgentSkillClient);
        expect(result.status).to.equal("failed");
        expect(result.counts.failed).to.equal(1);
    });

    it("does not modify files or state when the manifest is unavailable", async () => {
        const firstArchive = await archive("First version");
        const first = metadata(firstArchive.archiveSha256);
        await syncAgentSkills(clientFor(first, firstArchive.bytes));
        const before = await loadAgentSkillState();
        const destination = path.join(managedRoot, first.name);

        const result = await syncAgentSkills(({
            manifest: async () => {
                throw new Error("outage");
            }
        } as unknown) as AgentSkillClient);
        expect(result.status).to.equal("failed");
        expect(result.counts.failed).to.equal(1);
        expect(
            await fs.readFile(path.join(destination, "SKILL.md"), "utf8")
        ).to.equal(skillMarkdown("First version"));
        expect(await loadAgentSkillState()).to.deep.equal(before);
    });
});
