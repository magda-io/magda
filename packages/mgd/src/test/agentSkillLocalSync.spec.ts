import { expect } from "chai";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentSkillClient } from "../agentSkillClient.js";
import {
    createAgentSkillArchive,
    extractAgentSkillArchive
} from "../agentSkillArchive.js";
import {
    agentSkillProjectionStatePath,
    createAgentSkillSourceIdentity,
    loadAgentSkillProjectionState,
    loadAgentSkillSourceState,
    saveAgentSkillProjectionState,
    saveAgentSkillSourceState,
    sourceStateKey
} from "../agentSkillLocalState.js";
import { syncLocalAgentSkills } from "../agentSkillLocalSync.js";
import {
    activateAgentSkillSource,
    createAgentSkillProjection
} from "../agentSkillProjection.js";
import { loadConfig, saveConfig } from "../profile.js";
import type {
    AgentSkillMetadata,
    LocalSkillManifest
} from "../agentSkillTypes.js";

const userId = "00000000-0000-4000-8000-000000000123";
const ref = {
    type: "user" as const,
    id: `agent-skill-${userId}-useful-skill`
};
const markdown = (body: string) => `---
name: useful-skill
description: A useful skill
---

# Useful skill

${body}
`;

function metadata(checksum: string, owner = userId): AgentSkillMetadata {
    return {
        ...ref,
        userId: owner,
        ownerId: owner,
        name: "useful-skill",
        description: "A useful skill",
        checksum,
        createdAt: "2025-01-01T00:00:00.000Z",
        createdBy: owner,
        updatedAt: "2025-01-01T00:00:00.000Z",
        updatedBy: owner
    };
}

function manifest(source?: AgentSkillMetadata): LocalSkillManifest {
    return {
        version: 1,
        complete: true,
        identity: { tenantId: "7", userId: source?.userId || userId },
        items: source
            ? [
                  {
                      selectionId: source.id,
                      effectiveName: source.name,
                      sourceKind: "own-user-publication",
                      source
                  }
              ]
            : [],
        warnings: []
    };
}

function client(
    baseUrl: string,
    source: AgentSkillMetadata | undefined,
    bytes?: Buffer,
    fail = false
): AgentSkillClient {
    return ({
        baseUrl,
        localManifest: async () => {
            if (fail) throw new Error("outage");
            return manifest(source);
        },
        download: async () => {
            if (!source || !bytes) throw new Error("unexpected download");
            return { metadata: source, bytes };
        }
    } as unknown) as AgentSkillClient;
}

describe("local multi-profile Agent Skill synchronization", () => {
    let tmp: string;
    let original: Record<string, string | undefined>;
    let projectionRoot: string;

    beforeEach(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mgd-local-sync-"));
        original = {};
        for (const key of [
            "XDG_CONFIG_HOME",
            "XDG_DATA_HOME",
            "MGD_AGENT_SKILL_DIR",
            "DSH_HOME",
            "HOME"
        ]) {
            original[key] = process.env[key];
            delete process.env[key];
        }
        process.env.XDG_CONFIG_HOME = path.join(tmp, "config");
        process.env.XDG_DATA_HOME = path.join(tmp, "data");
        process.env.HOME = path.join(tmp, "home");
        projectionRoot = path.join(tmp, "active");
        process.env.MGD_AGENT_SKILL_DIR = projectionRoot;
    });

    afterEach(async () => {
        for (const [key, value] of Object.entries(original)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        await fs.rm(tmp, { recursive: true, force: true });
    });

    async function archive(body: string) {
        const directory = path.join(tmp, `archive-${randomUUID()}`);
        await fs.mkdir(directory);
        await fs.writeFile(path.join(directory, "SKILL.md"), markdown(body));
        return createAgentSkillArchive(directory, "user");
    }

    it("isolates identical publication ids and names by instance and account", async () => {
        const firstArchive = await archive("Instance A");
        const secondArchive = await archive("Instance B");
        const first = metadata(firstArchive.archiveSha256);
        const second = metadata(secondArchive.archiveSha256);

        expect(
            (
                await syncLocalAgentSkills(
                    client("https://a.example/api", first, firstArchive.bytes),
                    { selectedProfile: "a", activate: false }
                )
            ).status
        ).to.equal("success");
        expect(
            (
                await syncLocalAgentSkills(
                    client(
                        "https://b.example/api",
                        second,
                        secondArchive.bytes
                    ),
                    { selectedProfile: "b", activate: false }
                )
            ).status
        ).to.equal("success");

        const a = createAgentSkillSourceIdentity({
            baseUrl: "https://a.example/api/",
            tenantId: "7",
            userId
        });
        const b = createAgentSkillSourceIdentity({
            baseUrl: "https://b.example/api",
            tenantId: "7",
            userId
        });
        expect(a.key).not.to.equal(b.key);
        const [aState, bState] = await Promise.all([
            loadAgentSkillSourceState(a),
            loadAgentSkillSourceState(b)
        ]);
        expect(aState.entries[sourceStateKey(ref)].remoteChecksum).to.equal(
            firstArchive.archiveSha256
        );
        expect(bState.entries[sourceStateKey(ref)].remoteChecksum).to.equal(
            secondArchive.archiveSha256
        );
    });

    it("activates on sync and force-preserves an edited projection when remote is unchanged", async () => {
        const published = await archive("Published");
        const source = metadata(published.archiveSha256);
        const api = client("https://one.example/api", source, published.bytes);
        await syncLocalAgentSkills(api, {
            selectedProfile: "default",
            activate: true
        });
        const active = path.join(projectionRoot, "useful-skill", "SKILL.md");
        await fs.writeFile(active, markdown("Local edit"));

        const normal = await syncLocalAgentSkills(api, {
            selectedProfile: "default",
            activate: true
        });
        expect(normal.status).to.equal("partial");
        expect(await fs.readFile(active, "utf8")).to.equal(
            markdown("Local edit")
        );

        const forced = await syncLocalAgentSkills(api, {
            selectedProfile: "default",
            activate: true,
            force: true
        });
        expect(forced.status).to.equal("success");
        expect(await fs.readFile(active, "utf8")).to.equal(
            markdown("Published")
        );
        const identity = createAgentSkillSourceIdentity({
            baseUrl: "https://one.example/api",
            tenantId: "7",
            userId
        });
        const drafts = path.join(
            process.env.XDG_DATA_HOME!,
            "mgd",
            "agent-skills",
            "sources",
            identity.key,
            "drafts",
            "projection"
        );
        expect(await fs.readdir(drafts)).to.have.length(1);
    });

    it("force preserves an edited cache and restores it when remote checksum is unchanged", async () => {
        const published = await archive("Published");
        const source = metadata(published.archiveSha256);
        const baseUrl = "https://one.example/api";
        const api = client(baseUrl, source, published.bytes);
        await syncLocalAgentSkills(api, {
            selectedProfile: "default",
            activate: false
        });
        const identity = createAgentSkillSourceIdentity({
            baseUrl,
            tenantId: "7",
            userId
        });
        const state = await loadAgentSkillSourceState(identity);
        const cached = state.entries[sourceStateKey(ref)];
        await fs.writeFile(
            path.join(cached.libraryDir, "SKILL.md"),
            markdown("Edited cache")
        );
        const result = await syncLocalAgentSkills(api, {
            selectedProfile: "default",
            activate: false,
            force: true
        });
        expect(result.items[0]).to.deep.include({
            action: "updated",
            code: "LOCAL_CHANGES_PRESERVED"
        });
        expect(
            await fs.readFile(path.join(cached.libraryDir, "SKILL.md"), "utf8")
        ).to.equal(markdown("Published"));
        const drafts = path.join(
            process.env.XDG_DATA_HOME!,
            "mgd",
            "agent-skills",
            "sources",
            identity.key,
            "drafts",
            "library"
        );
        const preserved = await fs.readdir(drafts);
        expect(preserved).to.have.length(1);
        expect(
            await fs.readFile(
                path.join(drafts, preserved[0], "SKILL.md"),
                "utf8"
            )
        ).to.equal(markdown("Edited cache"));
    });

    it("recovers an update interrupted after archive and tree replacement", async () => {
        const first = await archive("First");
        const baseUrl = "https://one.example/api";
        await syncLocalAgentSkills(
            client(baseUrl, metadata(first.archiveSha256), first.bytes),
            { selectedProfile: "default", activate: false }
        );
        const identity = createAgentSkillSourceIdentity({
            baseUrl,
            tenantId: "7",
            userId
        });
        const state = await loadAgentSkillSourceState(identity);
        const cached = state.entries[sourceStateKey(ref)];
        const second = await archive("Second");
        await fs.writeFile(cached.archiveFile, second.bytes);
        await extractAgentSkillArchive(second.bytes, "user", cached.libraryDir);

        const recovered = await syncLocalAgentSkills(
            client(baseUrl, metadata(second.archiveSha256), second.bytes),
            { selectedProfile: "default", activate: false }
        );
        expect(recovered.status).to.equal("success");
        expect(recovered.items[0]).to.deep.include({
            action: "updated",
            code: "INTERRUPTED_UPDATE_RECOVERED"
        });
        const repaired = await loadAgentSkillSourceState(identity);
        expect(repaired.entries[sourceStateKey(ref)].remoteChecksum).to.equal(
            second.archiveSha256
        );
    });

    it("redownloads when a missing cache has a corrupt cached archive", async () => {
        const published = await archive("Published");
        const source = metadata(published.archiveSha256);
        const baseUrl = "https://one.example/api";
        const api = client(baseUrl, source, published.bytes);
        await syncLocalAgentSkills(api, {
            selectedProfile: "default",
            activate: false
        });
        const identity = createAgentSkillSourceIdentity({
            baseUrl,
            tenantId: "7",
            userId
        });
        const state = await loadAgentSkillSourceState(identity);
        const cached = state.entries[sourceStateKey(ref)];
        await fs.rm(cached.libraryDir, { recursive: true, force: true });
        await fs.writeFile(cached.archiveFile, Buffer.from("corrupt"));
        const repaired = await syncLocalAgentSkills(api, {
            selectedProfile: "default",
            activate: false
        });
        expect(repaired.status).to.equal("success");
        expect(repaired.items[0].action).to.equal("updated");
        expect(
            await fs.readFile(path.join(cached.libraryDir, "SKILL.md"), "utf8")
        ).to.equal(markdown("Published"));
    });

    it("restores a missing tracked cache from its verified archive", async () => {
        const published = await archive("Published");
        const source = metadata(published.archiveSha256);
        const baseUrl = "https://one.example/api";
        const api = client(baseUrl, source, published.bytes);
        await syncLocalAgentSkills(api, {
            selectedProfile: "default",
            activate: false
        });
        const identity = createAgentSkillSourceIdentity({
            baseUrl,
            tenantId: "7",
            userId
        });
        const state = await loadAgentSkillSourceState(identity);
        const cached = state.entries[sourceStateKey(ref)];
        await fs.rm(cached.libraryDir, { recursive: true, force: true });
        const repaired = await syncLocalAgentSkills(api, {
            selectedProfile: "default",
            activate: false
        });
        expect(repaired.items[0]).to.deep.include({
            action: "updated",
            code: "MISSING_CACHE_RESTORED"
        });
        expect(
            await fs.readFile(path.join(cached.libraryDir, "SKILL.md"), "utf8")
        ).to.equal(markdown("Published"));
    });

    it("records projection edits as source-scoped drafts before deactivation", async () => {
        const published = await archive("Published");
        const source = metadata(published.archiveSha256);
        const baseUrl = "https://one.example/api";
        await syncLocalAgentSkills(client(baseUrl, source, published.bytes), {
            selectedProfile: "default",
            activate: true
        });
        const active = path.join(projectionRoot, "useful-skill", "SKILL.md");
        await fs.writeFile(active, markdown("Projection edit"));
        await activateAgentSkillSource(undefined, "empty");
        const identity = createAgentSkillSourceIdentity({
            baseUrl,
            tenantId: "7",
            userId
        });
        const state = await loadAgentSkillSourceState(identity);
        const draft = Object.values(state.drafts).find(
            (item) => item.ref?.id === ref.id
        );
        expect(draft?.baseChecksum).to.equal(published.archiveSha256);
        expect(draft?.treeDigest).to.match(/^[0-9a-f]{64}$/);
        expect(draft?.treeDigest).not.to.equal(
            state.entries[sourceStateKey(ref)].installedTreeDigest
        );
    });

    it("preserves malformed local edits and removes them from execution", async () => {
        const published = await archive("Published");
        const source = metadata(published.archiveSha256);
        const baseUrl = "https://one.example/api";
        await syncLocalAgentSkills(client(baseUrl, source, published.bytes), {
            selectedProfile: "default",
            activate: true
        });
        const activeDirectory = path.join(projectionRoot, "useful-skill");
        await fs.writeFile(
            path.join(activeDirectory, "SKILL.md"),
            "not valid frontmatter"
        );
        await fs.writeFile(path.join(activeDirectory, "scratch.bin"), "local");
        const activation = await activateAgentSkillSource(undefined, "empty");
        expect(activation.preservedDrafts).to.equal(1);
        let activeExists = true;
        try {
            await fs.lstat(activeDirectory);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT")
                activeExists = false;
            else throw error;
        }
        expect(activeExists).to.equal(false);
        const identity = createAgentSkillSourceIdentity({
            baseUrl,
            tenantId: "7",
            userId
        });
        const state = await loadAgentSkillSourceState(identity);
        const [draftPath, draft] = Object.entries(state.drafts).find(
            ([, item]) => item.ref?.id === ref.id
        )!;
        expect(draft.treeDigest).to.match(/^[0-9a-f]{64}$/);
        expect(
            await fs.readFile(path.join(draftPath, "scratch.bin"), "utf8")
        ).to.equal("local");
    });

    it("does not let one-off credentials replace a named profile identity", async () => {
        const sourceA = createAgentSkillSourceIdentity({
            baseUrl: "https://one.example/api",
            tenantId: "7",
            userId
        });
        await saveConfig({
            activeProfile: "default",
            profiles: {
                default: {
                    baseUrl: "https://one.example/api",
                    agentSkillSource: {
                        ...sourceA,
                        verifiedAt: "2025-01-01T00:00:00.000Z"
                    }
                }
            }
        });
        const otherUser = "00000000-0000-4000-8000-000000000456";
        const otherRef = {
            ...ref,
            id: `agent-skill-${otherUser}-useful-skill`
        };
        const published = await archive("Other user");
        const other = {
            ...metadata(published.archiveSha256, otherUser),
            ...otherRef,
            userId: otherUser,
            ownerId: otherUser
        };
        const overriddenClient = ({
            baseUrl: "https://one.example/api",
            localManifest: async () => ({
                ...manifest(other),
                identity: { tenantId: "7", userId: otherUser }
            }),
            download: async () => ({ metadata: other, bytes: published.bytes })
        } as unknown) as AgentSkillClient;
        await syncLocalAgentSkills(overriddenClient, {
            selectedProfile: "default",
            activate: false,
            persistProfileIdentity: false
        });
        expect(
            (await loadConfig()).profiles.default.agentSkillSource?.key
        ).to.equal(sourceA.key);
    });

    it("never replaces an unmanaged colliding directory", async () => {
        const published = await archive("Published");
        const source = metadata(published.archiveSha256);
        const collision = path.join(projectionRoot, "useful-skill");
        await fs.mkdir(collision, { recursive: true });
        await fs.writeFile(
            path.join(collision, "SKILL.md"),
            markdown("Unmanaged")
        );
        const result = await syncLocalAgentSkills(
            client("https://one.example/api", source, published.bytes),
            { selectedProfile: "default", activate: true }
        );
        expect(result.status).to.equal("partial");
        expect(
            result.items.some((item) => item.code?.includes("PROJECTION"))
        ).to.equal(true);
        expect(
            await fs.readFile(path.join(collision, "SKILL.md"), "utf8")
        ).to.equal(markdown("Unmanaged"));
        expect(
            Object.values((await loadAgentSkillProjectionState()).entries).some(
                (entry) => entry.path === collision
            )
        ).to.equal(false);
    });

    it("isolates one harness collision while activating safe targets", async () => {
        delete process.env.MGD_AGENT_SKILL_DIR;
        await Promise.all([
            fs.mkdir(path.join(process.env.HOME!, ".agents"), {
                recursive: true
            }),
            fs.mkdir(path.join(process.env.XDG_CONFIG_HOME!, "opencode"), {
                recursive: true
            })
        ]);
        const claudeCollision = path.join(
            process.env.HOME!,
            ".claude",
            "skills",
            "useful-skill"
        );
        await fs.mkdir(claudeCollision, { recursive: true });
        await fs.writeFile(
            path.join(claudeCollision, "SKILL.md"),
            markdown("Unmanaged Claude")
        );
        const published = await archive("Published");
        const source = metadata(published.archiveSha256);
        const result = await syncLocalAgentSkills(
            client("https://one.example/api", source, published.bytes),
            { selectedProfile: "default", activate: true }
        );
        expect(result.status).to.equal("partial");
        const promotedPrimary = path.join(
            process.env.HOME!,
            ".agents",
            "skills",
            "useful-skill"
        );
        expect((await fs.lstat(promotedPrimary)).isSymbolicLink()).to.equal(
            true
        );
        expect(
            await fs.readFile(path.join(promotedPrimary, "SKILL.md"), "utf8")
        ).to.equal(markdown("Published"));
        for (const candidate of [
            promotedPrimary,
            path.join(
                process.env.XDG_CONFIG_HOME!,
                "opencode",
                "skills",
                "useful-skill"
            )
        ]) {
            let exists = true;
            try {
                await fs.lstat(candidate);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT")
                    exists = false;
                else throw error;
            }
            expect(exists).to.equal(true);
        }
        expect(
            await fs.readFile(path.join(claudeCollision, "SKILL.md"), "utf8")
        ).to.equal(markdown("Unmanaged Claude"));
    });

    it("rejects symlinked ancestors in managed projection roots", async () => {
        const real = path.join(tmp, "real-parent");
        await fs.mkdir(real);
        const linkedParent = path.join(tmp, "linked-parent");
        await fs.symlink(real, linkedParent, "dir");
        process.env.MGD_AGENT_SKILL_DIR = path.join(linkedParent, "skills");
        const published = await archive("Published");
        const source = metadata(published.archiveSha256);
        const result = await syncLocalAgentSkills(
            client("https://one.example/api", source, published.bytes),
            { selectedProfile: "default", activate: true }
        );
        expect(result.status).to.equal("partial");
        expect(result.items.some((item) => item.action === "skipped")).to.equal(
            true
        );
        let created = true;
        try {
            await fs.lstat(path.join(real, "skills", "useful-skill"));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT")
                created = false;
            else throw error;
        }
        expect(created).to.equal(false);
    });

    it("never follows a replaced ownership-marker directory during cleanup", async () => {
        const published = await archive("Marker safety");
        await syncLocalAgentSkills(
            client(
                "https://one.example/api",
                metadata(published.archiveSha256),
                published.bytes
            ),
            { selectedProfile: "default", activate: true }
        );
        const markerDirectory = path.join(
            projectionRoot,
            ".mgd-agent-skill-ownership"
        );
        const external = path.join(tmp, "external-markers");
        await fs.mkdir(external);
        const markerName = "useful-skill.json";
        const marker = await fs.readFile(
            path.join(markerDirectory, markerName),
            "utf8"
        );
        await fs.rm(markerDirectory, { recursive: true });
        await fs.writeFile(path.join(external, markerName), marker);
        await fs.symlink(external, markerDirectory, "dir");
        const result = await activateAgentSkillSource(undefined, "empty");
        expect(result.conflicts).to.include(
            path.join(projectionRoot, "useful-skill")
        );
        expect(
            await fs.readFile(path.join(external, markerName), "utf8")
        ).to.equal(marker);
    });

    it("never reads or updates an ownership marker file symlink", async () => {
        const published = await archive("Marker file safety");
        await syncLocalAgentSkills(
            client(
                "https://one.example/api",
                metadata(published.archiveSha256),
                published.bytes
            ),
            { selectedProfile: "default", activate: true }
        );
        const markerPath = path.join(
            projectionRoot,
            ".mgd-agent-skill-ownership",
            "useful-skill.json"
        );
        const external = path.join(tmp, "external-marker.json");
        const externalContent = "do not overwrite";
        await fs.writeFile(external, externalContent);
        await fs.rm(markerPath);
        await fs.symlink(external, markerPath);
        const result = await activateAgentSkillSource(undefined, "empty");
        expect(result.conflicts).to.include(
            path.join(projectionRoot, "useful-skill")
        );
        expect(await fs.readFile(external, "utf8")).to.equal(externalContent);
    });

    it("atomically replaces a verified hard-linked ownership marker", async () => {
        const published = await archive("Hardlink marker safety");
        const baseUrl = "https://one.example/api";
        await syncLocalAgentSkills(
            client(baseUrl, metadata(published.archiveSha256), published.bytes),
            { selectedProfile: "default", activate: true }
        );
        const identity = createAgentSkillSourceIdentity({
            baseUrl,
            tenantId: "7",
            userId
        });
        const projection = await loadAgentSkillProjectionState();
        const pair = Object.entries(projection.entries).find(
            ([, entry]) => entry.root === projectionRoot
        )!;
        pair[1].phase = "planned";
        pair[1].stagingPath = `${pair[1].path}.mgd-stage-${pair[1].ownershipToken}`;
        await saveAgentSkillProjectionState(projection);
        const markerPath = path.join(
            projectionRoot,
            ".mgd-agent-skill-ownership",
            "useful-skill.json"
        );
        const external = path.join(tmp, "hard-linked-marker.json");
        const marker = JSON.parse(await fs.readFile(markerPath, "utf8"));
        marker.reserved = false;
        await fs.writeFile(external, JSON.stringify(marker));
        await fs.rm(markerPath);
        await fs.link(external, markerPath);

        const recovered = await activateAgentSkillSource(identity, "default");
        expect(recovered.conflicts).to.deep.equal([]);
        expect(
            JSON.parse(await fs.readFile(external, "utf8")).reserved
        ).to.equal(false);
        expect(
            JSON.parse(await fs.readFile(markerPath, "utf8")).reserved
        ).to.equal(true);
    });

    it("uses flat native harness roots with per-skill links and DSH copies", async () => {
        delete process.env.MGD_AGENT_SKILL_DIR;
        process.env.DSH_HOME = path.join(tmp, "dsh");
        await Promise.all([
            fs.mkdir(path.join(process.env.HOME!, ".claude"), {
                recursive: true
            }),
            fs.mkdir(path.join(process.env.HOME!, ".agents"), {
                recursive: true
            }),
            fs.mkdir(path.join(process.env.XDG_CONFIG_HOME!, "opencode"), {
                recursive: true
            })
        ]);
        const published = await archive("Harness discovery");
        const source = metadata(published.archiveSha256);
        await syncLocalAgentSkills(
            client("https://one.example/api", source, published.bytes),
            { selectedProfile: "default", activate: true }
        );
        const roots = [
            path.join(process.env.HOME!, ".claude", "skills"),
            path.join(process.env.HOME!, ".agents", "skills"),
            path.join(process.env.XDG_CONFIG_HOME!, "opencode", "skills"),
            path.join(process.env.DSH_HOME, "skills")
        ];
        for (const root of roots) {
            expect(
                await fs.readFile(
                    path.join(root, "useful-skill", "SKILL.md"),
                    "utf8"
                )
            ).to.equal(markdown("Harness discovery"));
        }
        expect(
            (
                await fs.lstat(path.join(roots[0], "useful-skill"))
            ).isSymbolicLink()
        ).to.equal(true);
        expect(
            (
                await fs.lstat(path.join(roots[1], "useful-skill"))
            ).isSymbolicLink()
        ).to.equal(true);
        expect(
            (await fs.lstat(path.join(roots[3], "useful-skill"))).isDirectory()
        ).to.equal(true);
    });

    it("recovers a symlink published before its ownership commit", async () => {
        delete process.env.MGD_AGENT_SKILL_DIR;
        await fs.mkdir(path.join(process.env.HOME!, ".claude"), {
            recursive: true
        });
        const published = await archive("Symlink recovery");
        const baseUrl = "https://one.example/api";
        await syncLocalAgentSkills(
            client(baseUrl, metadata(published.archiveSha256), published.bytes),
            { selectedProfile: "default", activate: true }
        );
        const identity = createAgentSkillSourceIdentity({
            baseUrl,
            tenantId: "7",
            userId
        });
        const projection = await loadAgentSkillProjectionState();
        const pair = Object.entries(projection.entries).find(
            ([, entry]) =>
                entry.root === path.join(process.env.HOME!, ".claude", "skills")
        )!;
        pair[1].phase = "planned";
        pair[1].stagingPath = `${pair[1].path}.mgd-stage-${pair[1].ownershipToken}`;
        await fs.writeFile(pair[1].stagingPath, "symlink-attempt\n");
        await saveAgentSkillProjectionState(projection);
        const markerPath = path.join(
            pair[1].root,
            ".mgd-agent-skill-ownership",
            `${pair[1].name}.json`
        );
        const marker = JSON.parse(await fs.readFile(markerPath, "utf8"));
        marker.reserved = false;
        await fs.writeFile(markerPath, JSON.stringify(marker));

        const recovered = await activateAgentSkillSource(identity, "default");
        expect(recovered.conflicts).to.deep.equal([]);
        const state = await loadAgentSkillProjectionState();
        expect(state.entries[pair[0]].phase).to.equal("ready");
        expect(state.entries[pair[0]].stagingPath).to.equal(undefined);
        expect((await fs.lstat(pair[1].path)).isSymbolicLink()).to.equal(true);
    });

    it("deactivates dependents instead of diverging when the shared primary is edited", async () => {
        delete process.env.MGD_AGENT_SKILL_DIR;
        process.env.DSH_HOME = path.join(tmp, "dsh-edited");
        await Promise.all([
            fs.mkdir(path.join(process.env.HOME!, ".claude"), {
                recursive: true
            }),
            fs.mkdir(path.join(process.env.HOME!, ".agents"), {
                recursive: true
            })
        ]);
        const published = await archive("Published");
        const source = metadata(published.archiveSha256);
        const api = client("https://one.example/api", source, published.bytes);
        await syncLocalAgentSkills(api, {
            selectedProfile: "default",
            activate: true
        });
        const targets = [
            path.join(process.env.HOME!, ".claude", "skills", "useful-skill"),
            path.join(process.env.HOME!, ".agents", "skills", "useful-skill"),
            path.join(process.env.DSH_HOME, "skills", "useful-skill")
        ];
        await fs.writeFile(
            path.join(targets[0], "SKILL.md"),
            markdown("Shared edit")
        );
        const reconciled = await syncLocalAgentSkills(api, {
            selectedProfile: "default",
            activate: true
        });
        expect(reconciled.status).to.equal("partial");
        for (const target of targets) {
            let exists = true;
            try {
                await fs.lstat(target);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT")
                    exists = false;
                else throw error;
            }
            expect(exists).to.equal(false);
        }
        const restored = await syncLocalAgentSkills(api, {
            selectedProfile: "default",
            activate: true,
            force: true
        });
        expect(restored.status).to.equal("success");
        for (const target of targets)
            expect(
                await fs.readFile(path.join(target, "SKILL.md"), "utf8")
            ).to.equal(markdown("Published"));
    });

    it("falls back to a verified directory copy when symlink creation is unsupported", async () => {
        const source = path.join(tmp, "fallback-source");
        const destination = path.join(tmp, "fallback-target", "useful-skill");
        await fs.mkdir(source, { recursive: true });
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(path.join(source, "SKILL.md"), markdown("Fallback"));
        const mode = await createAgentSkillProjection(
            destination,
            source,
            "symlink",
            (async () => {
                const error = new Error(
                    "links unsupported"
                ) as NodeJS.ErrnoException;
                error.code = "EPERM";
                throw error;
            }) as typeof fs.symlink
        );
        expect(mode).to.equal("copy");
        expect((await fs.lstat(destination)).isDirectory()).to.equal(true);
        expect(
            await fs.readFile(path.join(destination, "SKILL.md"), "utf8")
        ).to.equal(markdown("Fallback"));
    });

    it("recovers a verified atomic copy published before marker commit", async () => {
        const published = await archive("Atomic recovery");
        const baseUrl = "https://one.example/api";
        await syncLocalAgentSkills(
            client(baseUrl, metadata(published.archiveSha256), published.bytes),
            { selectedProfile: "default", activate: true }
        );
        const identity = createAgentSkillSourceIdentity({
            baseUrl,
            tenantId: "7",
            userId
        });
        const projection = await loadAgentSkillProjectionState();
        const pair = Object.entries(projection.entries).find(
            ([, entry]) => entry.root === projectionRoot
        )!;
        pair[1].phase = "planned";
        pair[1].stagingPath = `${pair[1].path}.mgd-stage-${pair[1].ownershipToken}`;
        await saveAgentSkillProjectionState(projection);
        const markerPath = path.join(
            projectionRoot,
            ".mgd-agent-skill-ownership",
            "useful-skill.json"
        );
        const marker = JSON.parse(await fs.readFile(markerPath, "utf8"));
        marker.reserved = false;
        await fs.writeFile(markerPath, JSON.stringify(marker));

        const result = await activateAgentSkillSource(identity, "default");
        expect(result.conflicts).to.deep.equal([]);
        const recovered = await loadAgentSkillProjectionState();
        expect(recovered.entries[pair[0]].phase).to.equal("ready");
        expect(recovered.entries[pair[0]].stagingPath).to.equal(undefined);
        expect(
            JSON.parse(await fs.readFile(markerPath, "utf8")).reserved
        ).to.equal(true);
    });

    it("never replaces an unmanaged directory during copy reservation", async () => {
        const source = path.join(tmp, "race-source");
        const destination = path.join(tmp, "race-target", "useful-skill");
        await fs.mkdir(source, { recursive: true });
        await fs.mkdir(destination, { recursive: true });
        await fs.writeFile(path.join(source, "SKILL.md"), markdown("Source"));
        let caught: unknown;
        try {
            await createAgentSkillProjection(destination, source, "copy");
        } catch (error) {
            caught = error;
        }
        expect((caught as NodeJS.ErrnoException).code).to.equal("EEXIST");
        expect(await fs.readdir(destination)).to.deep.equal([]);
    });

    it("fails before projection mutation when Python 3 is unavailable", async () => {
        const previousPath = process.env.PATH;
        process.env.PATH = path.join(tmp, "no-executables");
        let caught: unknown;
        try {
            await activateAgentSkillSource(undefined, "empty");
        } catch (error) {
            caught = error;
        } finally {
            process.env.PATH = previousPath;
        }
        expect(caught).to.be.instanceOf(Error);
        expect((caught as Error).message).to.include("requires Python 3");
        expect((await loadAgentSkillProjectionState()).entries).to.deep.equal(
            {}
        );
    });

    it("rejects corrupt staging paths without deleting unmanaged siblings", async () => {
        const published = await archive("Corrupt state safety");
        await syncLocalAgentSkills(
            client(
                "https://one.example/api",
                metadata(published.archiveSha256),
                published.bytes
            ),
            { selectedProfile: "default", activate: true }
        );
        const projection = await loadAgentSkillProjectionState();
        const pair = Object.entries(projection.entries).find(
            ([, entry]) => entry.root === projectionRoot
        )!;
        const unmanaged = path.join(projectionRoot, "magda-mgd");
        await fs.mkdir(unmanaged);
        await fs.writeFile(path.join(unmanaged, "keep.txt"), "keep");
        pair[1].phase = "planned";
        pair[1].stagingPath = unmanaged;
        await fs.writeFile(
            agentSkillProjectionStatePath(),
            JSON.stringify(projection)
        );
        let caught: unknown;
        try {
            await activateAgentSkillSource(undefined, "empty");
        } catch (error) {
            caught = error;
        }
        expect(caught).to.be.instanceOf(Error);
        expect(
            await fs.readFile(path.join(unmanaged, "keep.txt"), "utf8")
        ).to.equal("keep");
    });

    it("rolls back a pre-move preservation draft reservation", async () => {
        const published = await archive("Preservation intent");
        const baseUrl = "https://one.example/api";
        await syncLocalAgentSkills(
            client(baseUrl, metadata(published.archiveSha256), published.bytes),
            { selectedProfile: "default", activate: true }
        );
        const identity = createAgentSkillSourceIdentity({
            baseUrl,
            tenantId: "7",
            userId
        });
        const projection = await loadAgentSkillProjectionState();
        const pair = Object.entries(projection.entries).find(
            ([, entry]) => entry.root === projectionRoot
        )!;
        const draft = path.join(
            process.env.XDG_DATA_HOME!,
            "mgd",
            "agent-skills",
            "sources",
            identity.key,
            "drafts",
            "projection",
            `${pair[1].name}-${pair[1].ownershipToken}`
        );
        pair[1].preservationDraftDir = draft;
        await saveAgentSkillProjectionState(projection);
        const source = await loadAgentSkillSourceState(identity);
        source.drafts[draft] = {
            type: "user",
            name: pair[1].name,
            ref,
            treeDigest: "0".repeat(64)
        };
        await saveAgentSkillSourceState(source);

        const recovered = await activateAgentSkillSource(identity, "default");
        expect(recovered.conflicts).to.deep.equal([]);
        expect(
            (await loadAgentSkillSourceState(identity)).drafts[draft]
        ).to.equal(undefined);
        const entry = (await loadAgentSkillProjectionState()).entries[pair[0]];
        expect(entry.preservationDraftDir).to.equal(undefined);
    });

    it("records the actual digest after recovering a moved preservation draft", async () => {
        const published = await archive("Moved preservation");
        const baseUrl = "https://one.example/api";
        await syncLocalAgentSkills(
            client(baseUrl, metadata(published.archiveSha256), published.bytes),
            { selectedProfile: "default", activate: true }
        );
        const identity = createAgentSkillSourceIdentity({
            baseUrl,
            tenantId: "7",
            userId
        });
        const projection = await loadAgentSkillProjectionState();
        const pair = Object.entries(projection.entries).find(
            ([, entry]) => entry.root === projectionRoot
        )!;
        const draft = path.join(
            process.env.XDG_DATA_HOME!,
            "mgd",
            "agent-skills",
            "sources",
            identity.key,
            "drafts",
            "projection",
            `${pair[1].name}-${pair[1].ownershipToken}`
        );
        await fs.mkdir(path.dirname(draft), { recursive: true });
        await fs.rename(pair[1].path, draft);
        pair[1].preservationDraftDir = draft;
        await saveAgentSkillProjectionState(projection);
        const source = await loadAgentSkillSourceState(identity);
        source.drafts[draft] = {
            type: "user",
            name: pair[1].name,
            ref,
            treeDigest: "0".repeat(64)
        };
        await saveAgentSkillSourceState(source);

        const recovered = await activateAgentSkillSource(identity, "default");
        expect(recovered.conflicts).to.deep.equal([]);
        expect(
            (await loadAgentSkillSourceState(identity)).drafts[draft].treeDigest
        )
            .to.match(/^[0-9a-f]{64}$/)
            .and.not.equal("0".repeat(64));
    });

    it("rejects projection aliases outside the owned token path", async () => {
        delete process.env.MGD_AGENT_SKILL_DIR;
        await fs.mkdir(path.join(process.env.HOME!, ".claude"), {
            recursive: true
        });
        const published = await archive("Alias state safety");
        await syncLocalAgentSkills(
            client(
                "https://one.example/api",
                metadata(published.archiveSha256),
                published.bytes
            ),
            { selectedProfile: "default", activate: true }
        );
        const projection = await loadAgentSkillProjectionState();
        const pair = Object.entries(projection.entries).find(
            ([, entry]) => entry.mode === "symlink" && entry.symlinkTarget
        )!;
        pair[1].symlinkTarget = path.join(tmp, "escaped-alias");
        await fs.writeFile(
            agentSkillProjectionStatePath(),
            JSON.stringify(projection)
        );
        let caught: unknown;
        try {
            await loadAgentSkillProjectionState();
        } catch (error) {
            caught = error;
        }
        expect(caught).to.be.instanceOf(Error);
        expect((caught as Error).message).to.include("unsafe entry");
    });

    it("preserves unverifiable v1 state and content instead of assigning it to a profile", async () => {
        const legacyState = path.join(
            process.env.XDG_CONFIG_HOME!,
            "mgd",
            "agent-skills-v1.json"
        );
        const legacyContent = path.join(projectionRoot, "legacy-skill");
        await fs.mkdir(path.dirname(legacyState), { recursive: true });
        await fs.mkdir(legacyContent, { recursive: true });
        await fs.writeFile(
            path.join(legacyContent, "SKILL.md"),
            "legacy content"
        );
        await fs.writeFile(
            legacyState,
            JSON.stringify({
                version: 1,
                managedRoot: projectionRoot,
                entries: {},
                drafts: {}
            })
        );
        const result = await syncLocalAgentSkills(
            client("https://one.example/api", undefined),
            { selectedProfile: "default", activate: true }
        );
        expect(result.status).to.equal("partial");
        expect(result.items[0].code).to.equal(
            "LEGACY_STATE_PRESERVED_REVIEW_REQUIRED"
        );
        let oldExists = true;
        try {
            await fs.stat(legacyState);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT")
                oldExists = false;
            else throw error;
        }
        expect(oldExists).to.equal(false);
        expect(
            await fs.readFile(path.join(legacyContent, "SKILL.md"), "utf8")
        ).to.equal("legacy content");
        const backups = await fs.readdir(
            path.join(
                process.env.XDG_DATA_HOME!,
                "mgd",
                "agent-skills",
                "migration"
            )
        );
        expect(backups).to.have.length(1);
    });

    it("keeps cache and projections intact during a remote outage", async () => {
        const published = await archive("Published");
        const source = metadata(published.archiveSha256);
        const baseUrl = "https://one.example/api";
        await syncLocalAgentSkills(client(baseUrl, source, published.bytes), {
            selectedProfile: "default",
            activate: true
        });
        const before = await fs.readFile(
            path.join(projectionRoot, "useful-skill", "SKILL.md"),
            "utf8"
        );
        const result = await syncLocalAgentSkills(
            client(baseUrl, undefined, undefined, true),
            { selectedProfile: "default", activate: true }
        );
        expect(result.status).to.equal("failed");
        expect(
            await fs.readFile(
                path.join(projectionRoot, "useful-skill", "SKILL.md"),
                "utf8"
            )
        ).to.equal(before);
    });
});
