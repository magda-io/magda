import { expect } from "chai";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { registerAgentSkillCommands } from "../commands/agentSkill.js";
import { registerSkillsCommands } from "../commands/skills.js";
import {
    createAgentSkillSourceIdentity,
    loadAgentSkillSourceState,
    saveAgentSkillSourceState,
    sourceStateKey
} from "../agentSkillLocalState.js";
import {
    createAgentSkillArchive,
    validateAgentSkillDirectory
} from "../agentSkillArchive.js";
import { loadConfig, saveConfig } from "../profile.js";
import { UsageError } from "../errors.js";
import { captureStdout } from "./captureStdout.js";
import { startMockServer } from "./mockServer.js";

const skillMarkdown = (body = "First version") => `---
name: useful-skill
description: A useful test skill
---

# Useful skill

${body}
`;

function programWithAgentSkills(): Command {
    const program = new Command();
    program.exitOverride();
    registerAgentSkillCommands(program);
    return program;
}

async function run(argv: string[]): Promise<string> {
    return captureStdout(() =>
        programWithAgentSkills().parseAsync(argv, { from: "user" })
    );
}

async function exists(target: string): Promise<boolean> {
    try {
        await fs.stat(target);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}

const userId = "00000000-0000-4000-8000-000000000123";

function metadata(id: string, checksum: string) {
    return {
        id,
        name: "useful-skill",
        description: "A useful test skill",
        type: "user",
        userId,
        ownerId: userId,
        createdAt: "2025-01-01T00:00:00.000Z",
        createdBy: "u1",
        updatedAt: "2025-01-01T00:00:00.000Z",
        updatedBy: "u1",
        checksum
    };
}

function localManifest() {
    return {
        version: 1,
        complete: true,
        identity: { tenantId: "0", userId },
        items: [],
        warnings: [],
        sources: {
            user: { status: "complete", selected: 0, warnings: 0 },
            installations: { status: "notImplemented" }
        }
    };
}

const localManifestRoute = () => ({
    method: "GET",
    path: "/api/v0/agent/skills/local-sync-manifest",
    body: localManifest()
});

describe("agent-skill CLI contracts", () => {
    let temporaryDirectory: string;
    let originalEnv: Record<string, string | undefined>;

    beforeEach(async () => {
        temporaryDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), "mgd-agent-skill-command-")
        );
        originalEnv = {};
        for (const key of [
            "XDG_CONFIG_HOME",
            "XDG_DATA_HOME",
            "MGD_AGENT_SKILL_DIR",
            "MGD_BASE_URL",
            "MGD_API_KEY_ID",
            "MGD_API_KEY",
            "MGD_PROFILE"
        ]) {
            originalEnv[key] = process.env[key];
            delete process.env[key];
        }
        process.env.XDG_CONFIG_HOME = path.join(temporaryDirectory, "config");
        process.env.XDG_DATA_HOME = path.join(temporaryDirectory, "data");
        process.env.MGD_AGENT_SKILL_DIR = path.join(
            temporaryDirectory,
            "managed"
        );
    });

    afterEach(async () => {
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        await fs.rm(temporaryDirectory, { recursive: true, force: true });
    });

    it("registers agent-skill without replacing the existing skills command", () => {
        const program = new Command();
        registerSkillsCommands(program);
        registerAgentSkillCommands(program);
        expect(
            program.commands.map((command) => command.name())
        ).to.deep.equal(["skills", "agent-skill"]);
        const agentSkill = program.commands.find(
            (command) => command.name() === "agent-skill"
        );
        expect(
            agentSkill?.commands.map((command) => command.name())
        ).to.deep.equal([
            "list",
            "show",
            "init",
            "validate",
            "publish",
            "pull",
            "delete",
            "sync"
        ]);
        const publish = agentSkill?.commands.find(
            (command) => command.name() === "publish"
        );
        expect(
            publish?.options.map((option) => option.long)
        ).to.include.members(["--type", "--force", "--json"]);
        expect(publish?.options.map((option) => option.long)).to.not.include(
            "--create"
        );
    });

    it("runs init and validate with zero profile or network access", async () => {
        const originalFetch = globalThis.fetch;
        let requests = 0;
        globalThis.fetch = (async () => {
            requests += 1;
            throw new Error("network must not be used");
        }) as typeof fetch;
        try {
            const draft = path.join(temporaryDirectory, "draft");
            const initialized = JSON.parse(
                await run([
                    "agent-skill",
                    "init",
                    "useful-skill",
                    "--output",
                    draft,
                    "--json"
                ])
            );
            expect(initialized).to.deep.include({
                type: "user",
                name: "useful-skill",
                directory: draft,
                published: false
            });
            const validated = JSON.parse(
                await run(["agent-skill", "validate", draft, "--json"])
            );
            expect(validated.name).to.equal("useful-skill");
            expect(validated.treeDigest).to.match(/^[0-9a-f]{64}$/);
            expect(requests).to.equal(0);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it("lists and shows publications through the configured caller-auth URL", async () => {
        const checksum = "a".repeat(64);
        const item = metadata(
            "agent-skill-00000000-0000-4000-8000-000000000123-useful-skill",
            checksum
        );
        const server = await startMockServer([
            {
                method: "GET",
                path: "/api/v0/agent/skills",
                body: { items: [item], hasMore: false }
            },
            {
                method: "GET",
                path:
                    "/api/v0/agent/skills/user/agent-skill-00000000-0000-4000-8000-000000000123-useful-skill",
                body: item
            }
        ]);
        process.env.MGD_BASE_URL = `${server.url}/api`;
        try {
            const listed = JSON.parse(
                await run(["agent-skill", "list", "--type", "user", "--json"])
            );
            expect(listed.items).to.deep.equal([item]);
            expect(
                JSON.parse(
                    await run([
                        "agent-skill",
                        "show",
                        "user/agent-skill-00000000-0000-4000-8000-000000000123-useful-skill",
                        "--json"
                    ])
                )
            ).to.deep.equal(item);
            expect(
                server.requests.map((request) => request.url)
            ).to.deep.equal([
                "/api/v0/agent/skills?type=user&limit=20",
                "/api/v0/agent/skills/user/agent-skill-00000000-0000-4000-8000-000000000123-useful-skill"
            ]);
        } finally {
            await server.close();
        }
    });

    it("creates on explicit publish, then replaces the tracked publication with If-Match", async () => {
        const firstChecksum = "a".repeat(64);
        const secondChecksum = "b".repeat(64);
        const currentRemoteChecksum = "c".repeat(64);
        const server = await startMockServer([
            localManifestRoute(),
            {
                method: "POST",
                path: "/api/v0/agent/skills/user",
                status: 201,
                body: metadata(
                    "agent-skill-00000000-0000-4000-8000-000000000123-useful-skill",
                    firstChecksum
                )
            },
            {
                method: "PUT",
                path:
                    "/api/v0/agent/skills/user/agent-skill-00000000-0000-4000-8000-000000000123-useful-skill/archive",
                body: metadata(
                    "agent-skill-00000000-0000-4000-8000-000000000123-useful-skill",
                    secondChecksum
                )
            },
            {
                method: "GET",
                path:
                    "/api/v0/agent/skills/user/agent-skill-00000000-0000-4000-8000-000000000123-useful-skill",
                body: metadata(
                    "agent-skill-00000000-0000-4000-8000-000000000123-useful-skill",
                    currentRemoteChecksum
                )
            }
        ]);
        process.env.MGD_BASE_URL = `${server.url}/api`;
        const draft = path.join(temporaryDirectory, "draft");
        await fs.mkdir(draft);
        await fs.writeFile(path.join(draft, "SKILL.md"), skillMarkdown());
        try {
            let forceError: unknown;
            try {
                await run([
                    "agent-skill",
                    "publish",
                    draft,
                    "--force",
                    "--json"
                ]);
            } catch (error) {
                forceError = error;
            }
            expect(forceError).to.be.instanceOf(UsageError);
            expect((forceError as Error).message).to.include(
                "tracked publication"
            );
            expect(server.requests).to.have.length(0);

            expect(
                JSON.parse(
                    await run(["agent-skill", "publish", draft, "--json"])
                ).checksum
            ).to.equal(firstChecksum);
            await fs.writeFile(
                path.join(draft, "SKILL.md"),
                skillMarkdown("Second version")
            );
            expect(
                JSON.parse(
                    await run(["agent-skill", "publish", draft, "--json"])
                ).checksum
            ).to.equal(secondChecksum);

            await run(["agent-skill", "publish", draft, "--force", "--json"]);

            const mutations = server.requests.filter((request) =>
                ["POST", "PUT"].includes(request.method)
            );
            expect(mutations.map((request) => request.method)).to.deep.equal([
                "POST",
                "PUT",
                "PUT"
            ]);
            expect(mutations[1].url).to.equal(
                "/api/v0/agent/skills/user/agent-skill-00000000-0000-4000-8000-000000000123-useful-skill/archive"
            );
            expect(mutations[1].headers["if-match"]).to.equal(
                `"${firstChecksum}"`
            );
            expect(mutations[2].headers["if-match"]).to.equal(
                `"${currentRemoteChecksum}"`
            );
            expect(mutations[0].headers["content-type"]).to.equal(
                "application/zip"
            );
            expect(mutations[1].headers["content-type"]).to.equal(
                "application/zip"
            );

            const identity = createAgentSkillSourceIdentity({
                baseUrl: `${server.url}/api`,
                tenantId: "0",
                userId
            });
            const state = await loadAgentSkillSourceState(identity);
            expect(state.drafts[path.resolve(draft)].baseChecksum).to.equal(
                secondChecksum
            );
        } finally {
            await server.close();
        }
    });

    it("rejects pull provenance when profile credentials change during download", async () => {
        const sourceDirectory = path.join(temporaryDirectory, "pull-source");
        await fs.mkdir(sourceDirectory);
        await fs.writeFile(
            path.join(sourceDirectory, "SKILL.md"),
            skillMarkdown()
        );
        const archive = await createAgentSkillArchive(sourceDirectory, "user");
        const id = `agent-skill-${userId}-useful-skill`;
        let serverUrl = "";
        const server = await startMockServer([
            {
                method: "GET",
                path: `/api/v0/agent/skills/user/${id}`,
                body: metadata(id, archive.archiveSha256)
            },
            {
                method: "GET",
                path: `/api/v0/agent/skills/user/${id}/archive`,
                handler: (_req, res) => {
                    void saveConfig({
                        activeProfile: "default",
                        profiles: {
                            default: {
                                baseUrl: `${serverUrl}/api`,
                                apiKeyId: "changed-id",
                                apiKey: "changed-key"
                            }
                        }
                    }).then(() => {
                        res.writeHead(200, {
                            "content-type": "application/zip"
                        });
                        res.end(archive.bytes);
                    });
                }
            },
            localManifestRoute()
        ]);
        serverUrl = server.url;
        await saveConfig({
            activeProfile: "default",
            profiles: {
                default: {
                    baseUrl: `${server.url}/api`,
                    apiKeyId: "original-id",
                    apiKey: "original-key"
                }
            }
        });
        const destination = path.join(temporaryDirectory, "pulled");
        try {
            let caught: unknown;
            try {
                await run([
                    "agent-skill",
                    "pull",
                    `user/${id}`,
                    "--output",
                    destination
                ]);
            } catch (error) {
                caught = error;
            }
            expect(caught).to.be.instanceOf(UsageError);
            expect((caught as Error).message).to.include("credentials changed");
            expect(await exists(destination)).to.equal(false);
            expect(
                (await loadConfig()).profiles.default.agentSkillSource
            ).to.equal(undefined);
        } finally {
            await server.close();
        }
    });

    it("requires an explicit matching type for a tracked publication", async () => {
        const directory = path.join(temporaryDirectory, "tracked-system");
        await fs.mkdir(directory);
        await fs.writeFile(
            path.join(directory, "SKILL.md"),
            `---\nname: system-tracked\ndescription: Tracked system skill\n---\n\n# tracked\n`
        );
        const identity = createAgentSkillSourceIdentity({
            baseUrl: "https://example.test/api",
            tenantId: "0",
            userId
        });
        const state = await loadAgentSkillSourceState(identity);
        state.drafts[directory] = {
            type: "system",
            name: "system-tracked",
            ref: { type: "system", id: "agent-skill-system-tracked" },
            baseChecksum: "a".repeat(64),
            treeDigest: "b".repeat(64)
        };
        await saveAgentSkillSourceState(state);
        let caught: unknown;
        try {
            await run(["agent-skill", "publish", directory]);
        } catch (error) {
            caught = error;
        }
        expect(caught).to.be.instanceOf(UsageError);
        expect((caught as Error).message).to.include("--type system");
    });

    it("emits a JSONL summary first and fails the process on total sync outage", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/api/v0/agent/skills/local-sync-manifest",
                status: 503,
                body: { error: { code: "REGISTRY_ERROR", message: "outage" } }
            }
        ]);
        process.env.MGD_BASE_URL = `${server.url}/api`;
        const originalExitCode = process.exitCode;
        try {
            process.exitCode = undefined;
            const lines = (await run(["agent-skill", "sync", "--jsonl"]))
                .trim()
                .split("\n")
                .map((line) => JSON.parse(line));
            expect(lines[0]).to.deep.include({
                kind: "summary",
                status: "failed"
            });
            expect(process.exitCode).to.equal(1);
        } finally {
            process.exitCode = originalExitCode;
            await server.close();
        }
    });

    it("rejects caller-selected Workspace mode outside the root-provisioned runtime", async () => {
        const server = await startMockServer([]);
        process.env.MGD_BASE_URL = `${server.url}/api`;
        try {
            let caught: unknown;
            try {
                await run([
                    "agent-skill",
                    "sync",
                    "--workspace-status",
                    "--json"
                ]);
            } catch (error) {
                caught = error;
            }
            expect(caught).to.be.instanceOf(UsageError);
            expect((caught as Error).message).to.include("root-provisioned");
            expect(server.requests).to.have.length(0);
        } finally {
            await server.close();
        }
    });

    it("delete removes source-scoped cached content and detaches tracked drafts", async () => {
        const checksum = "d".repeat(64);
        const ref = {
            type: "user" as const,
            id: "agent-skill-00000000-0000-4000-8000-000000000123-useful-skill"
        };
        const server = await startMockServer([
            localManifestRoute(),
            {
                method: "DELETE",
                path:
                    "/api/v0/agent/skills/user/agent-skill-00000000-0000-4000-8000-000000000123-useful-skill",
                body: {}
            }
        ]);
        process.env.MGD_BASE_URL = `${server.url}/api`;
        const identity = createAgentSkillSourceIdentity({
            baseUrl: `${server.url}/api`,
            tenantId: "0",
            userId
        });
        const state = await loadAgentSkillSourceState(identity);
        const sourceRoot = path.dirname(
            path.dirname(
                path.dirname(
                    path.join(
                        process.env.XDG_DATA_HOME!,
                        "mgd",
                        "agent-skills",
                        "sources",
                        identity.key,
                        "state.json"
                    )
                )
            )
        );
        const libraryDirectory = path.join(
            process.env.XDG_DATA_HOME!,
            "mgd",
            "agent-skills",
            "sources",
            identity.key,
            "skills",
            ref.id
        );
        const archiveFile = path.join(
            process.env.XDG_DATA_HOME!,
            "mgd",
            "agent-skills",
            "sources",
            identity.key,
            "archives",
            `${ref.id}.zip`
        );
        const pulledDraft = path.join(temporaryDirectory, "pulled-draft");
        await fs.mkdir(libraryDirectory, { recursive: true });
        await fs.writeFile(
            path.join(libraryDirectory, "SKILL.md"),
            skillMarkdown("Installed")
        );
        await fs.mkdir(path.dirname(archiveFile), { recursive: true });
        await fs.writeFile(archiveFile, "archive");
        await fs.mkdir(pulledDraft);
        await fs.writeFile(
            path.join(pulledDraft, "SKILL.md"),
            skillMarkdown("Draft")
        );
        const installed = await validateAgentSkillDirectory(
            libraryDirectory,
            "user"
        );
        const draft = await validateAgentSkillDirectory(pulledDraft, "user");
        state.entries[sourceStateKey(ref)] = {
            ref,
            name: "useful-skill",
            description: "A useful test skill",
            libraryDir: libraryDirectory,
            archiveFile,
            remoteChecksum: checksum,
            installedTreeDigest: installed.treeDigest,
            updatedAt: "2025-01-01T00:00:00.000Z"
        };
        state.drafts[pulledDraft] = {
            type: "user",
            name: "useful-skill",
            ref,
            baseChecksum: checksum,
            treeDigest: draft.treeDigest
        };
        await saveAgentSkillSourceState(state);

        try {
            const result = JSON.parse(
                await run(["agent-skill", "delete", `user/${ref.id}`, "--json"])
            );
            expect(result).to.deep.include({
                deleted: true,
                localDraftsPreserved: true
            });
            const request = server.requests.find(
                (candidate) => candidate.method === "DELETE"
            )!;
            expect(request.headers["if-match"]).to.equal(`"${checksum}"`);
            expect(await exists(libraryDirectory)).to.equal(false);
            expect(await exists(pulledDraft)).to.equal(true);

            const saved = await loadAgentSkillSourceState(identity);
            expect(saved.entries[sourceStateKey(ref)]).to.equal(undefined);
            expect(saved.drafts[pulledDraft].ref).to.equal(undefined);
            expect(saved.drafts[pulledDraft].baseChecksum).to.equal(undefined);
            expect(saved.drafts[pulledDraft].treeDigest).to.equal(
                draft.treeDigest
            );
        } finally {
            await server.close();
        }
    });

    it("delete preserves a modified source cache as a source-scoped draft", async () => {
        const checksum = "e".repeat(64);
        const ref = {
            type: "user" as const,
            id: "agent-skill-00000000-0000-4000-8000-000000000123-useful-skill"
        };
        const server = await startMockServer([
            localManifestRoute(),
            {
                method: "DELETE",
                path: `/api/v0/agent/skills/user/${ref.id}`,
                body: {}
            }
        ]);
        process.env.MGD_BASE_URL = `${server.url}/api`;
        const identity = createAgentSkillSourceIdentity({
            baseUrl: `${server.url}/api`,
            tenantId: "0",
            userId
        });
        const state = await loadAgentSkillSourceState(identity);
        const sourceRoot = path.join(
            process.env.XDG_DATA_HOME!,
            "mgd",
            "agent-skills",
            "sources",
            identity.key
        );
        const libraryDirectory = path.join(sourceRoot, "skills", ref.id);
        const archiveFile = path.join(sourceRoot, "archives", `${ref.id}.zip`);
        await fs.mkdir(libraryDirectory, { recursive: true });
        await fs.writeFile(
            path.join(libraryDirectory, "SKILL.md"),
            skillMarkdown("Installed")
        );
        await fs.mkdir(path.dirname(archiveFile), { recursive: true });
        await fs.writeFile(archiveFile, "archive");
        const installed = await validateAgentSkillDirectory(
            libraryDirectory,
            "user"
        );
        state.entries[sourceStateKey(ref)] = {
            ref,
            name: "useful-skill",
            description: "A useful test skill",
            libraryDir: libraryDirectory,
            archiveFile,
            remoteChecksum: checksum,
            installedTreeDigest: installed.treeDigest,
            updatedAt: "2025-01-01T00:00:00.000Z"
        };
        await saveAgentSkillSourceState(state);
        await fs.writeFile(
            path.join(libraryDirectory, "SKILL.md"),
            skillMarkdown("Local edit")
        );

        try {
            await run(["agent-skill", "delete", `user/${ref.id}`, "--json"]);
            expect(await exists(libraryDirectory)).to.equal(false);
            const draftsRoot = path.join(sourceRoot, "drafts", "deleted");
            const draftNames = await fs.readdir(draftsRoot);
            expect(draftNames).to.have.length(1);
            expect(
                await fs.readFile(
                    path.join(draftsRoot, draftNames[0], "SKILL.md"),
                    "utf8"
                )
            ).to.equal(skillMarkdown("Local edit"));
        } finally {
            await server.close();
        }
    });
});
