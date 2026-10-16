import { expect } from "chai";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { registerProfileCommands } from "../commands/profileCmd.js";
import { validateAgentSkillDirectory } from "../agentSkillArchive.js";
import { activateAgentSkillSource } from "../agentSkillProjection.js";
import {
    createAgentSkillSourceIdentity,
    loadAgentSkillProjectionState,
    loadAgentSkillSourceState,
    saveAgentSkillSourceState,
    sourceStateKey
} from "../agentSkillLocalState.js";
import { loadConfig, saveConfig } from "../profile.js";
import { captureStdout } from "./captureStdout.js";
import { recoverAgentSkillProfileTransition } from "../agentSkillProfileTransition.js";

const userId = "00000000-0000-4000-8000-000000000123";
const ref = { type: "user" as const, id: `agent-skill-${userId}-switchable` };
const markdown = (body: string) => `---
name: switchable
description: Profile switch test
---

${body}
`;

describe("offline Agent Skill profile activation", () => {
    let tmp: string;
    let original: Record<string, string | undefined>;
    let activeRoot: string;

    beforeEach(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mgd-profile-skills-"));
        original = {};
        for (const key of [
            "XDG_CONFIG_HOME",
            "XDG_DATA_HOME",
            "MGD_AGENT_SKILL_DIR",
            "MGD_PROFILE",
            "MGD_BASE_URL",
            "MGD_API_KEY_ID",
            "MGD_API_KEY"
        ]) {
            original[key] = process.env[key];
            delete process.env[key];
        }
        process.env.XDG_CONFIG_HOME = path.join(tmp, "config");
        process.env.XDG_DATA_HOME = path.join(tmp, "data");
        activeRoot = path.join(tmp, "active");
        process.env.MGD_AGENT_SKILL_DIR = activeRoot;
    });

    afterEach(async () => {
        for (const [key, value] of Object.entries(original)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        await fs.rm(tmp, { recursive: true, force: true });
    });

    async function seed(baseUrl: string, body: string) {
        const identity = createAgentSkillSourceIdentity({
            baseUrl,
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
        const libraryDir = path.join(sourceRoot, "skills", ref.id);
        await fs.mkdir(libraryDir, { recursive: true });
        await fs.writeFile(path.join(libraryDir, "SKILL.md"), markdown(body));
        const validated = await validateAgentSkillDirectory(libraryDir, "user");
        const archiveFile = path.join(sourceRoot, "archives", `${ref.id}.zip`);
        await fs.mkdir(path.dirname(archiveFile), { recursive: true });
        await fs.writeFile(archiveFile, "unused");
        state.entries[sourceStateKey(ref)] = {
            ref,
            name: "switchable",
            description: "Profile switch test",
            libraryDir,
            archiveFile,
            remoteChecksum: body.startsWith("Dev")
                ? "a".repeat(64)
                : "b".repeat(64),
            installedTreeDigest: validated.treeDigest,
            updatedAt: new Date().toISOString()
        };
        await saveAgentSkillSourceState(state);
        return identity;
    }

    async function runUse(name: string): Promise<string> {
        const program = new Command();
        program.exitOverride();
        registerProfileCommands(program);
        return captureStdout(() =>
            program.parseAsync(["profile", "use", name], { from: "user" })
        );
    }

    it("switches verified caches without network access and preserves both sources", async () => {
        const dev = await seed("https://dev.example/api", "Dev content");
        const prod = await seed("https://prod.example/api", "Prod content");
        await saveConfig({
            activeProfile: "dev",
            profiles: {
                dev: {
                    baseUrl: "https://dev.example/api",
                    agentSkillSource: {
                        ...dev,
                        verifiedAt: new Date().toISOString()
                    }
                },
                prod: {
                    baseUrl: "https://prod.example/api",
                    agentSkillSource: {
                        ...prod,
                        verifiedAt: new Date().toISOString()
                    }
                }
            }
        });
        await activateAgentSkillSource(dev, "dev");
        const originalFetch = globalThis.fetch;
        let requests = 0;
        globalThis.fetch = (async () => {
            requests += 1;
            throw new Error("offline profile use must not fetch");
        }) as typeof fetch;
        try {
            await runUse("prod");
        } finally {
            globalThis.fetch = originalFetch;
        }
        expect(requests).to.equal(0);
        expect((await loadConfig()).activeProfile).to.equal("prod");
        expect(
            await fs.readFile(
                path.join(activeRoot, "switchable", "SKILL.md"),
                "utf8"
            )
        ).to.equal(markdown("Prod content"));
        expect((await loadAgentSkillSourceState(dev)).entries).to.have.property(
            sourceStateKey(ref)
        );
        expect(
            (await loadAgentSkillSourceState(prod)).entries
        ).to.have.property(sourceStateKey(ref));
        expect(
            (await loadAgentSkillProjectionState()).activeSourceKey
        ).to.equal(prod.key);
    });

    it("keeps the prior profile selected and active when target cache is corrupt", async () => {
        const dev = await seed("https://dev.example/api", "Dev content");
        const prod = await seed("https://prod.example/api", "Prod content");
        await saveConfig({
            activeProfile: "dev",
            profiles: {
                dev: {
                    baseUrl: "https://dev.example/api",
                    agentSkillSource: {
                        ...dev,
                        verifiedAt: new Date().toISOString()
                    }
                },
                prod: {
                    baseUrl: "https://prod.example/api",
                    agentSkillSource: {
                        ...prod,
                        verifiedAt: new Date().toISOString()
                    }
                }
            }
        });
        await activateAgentSkillSource(dev, "dev");
        await fs.writeFile(
            path.join(
                process.env.XDG_DATA_HOME!,
                "mgd",
                "agent-skills",
                "sources",
                prod.key,
                "state.json"
            ),
            "{}"
        );
        let caught: unknown;
        try {
            await runUse("prod");
        } catch (error) {
            caught = error;
        }
        expect(caught).to.be.instanceOf(Error);
        expect((await loadConfig()).activeProfile).to.equal("dev");
        expect(
            await fs.readFile(
                path.join(activeRoot, "switchable", "SKILL.md"),
                "utf8"
            )
        ).to.equal(markdown("Dev content"));
    });

    it("recovers a crash after projection activation but before profile commit", async () => {
        const dev = await seed("https://dev.example/api", "Dev content");
        const prod = await seed("https://prod.example/api", "Prod content");
        const devProfile = {
            baseUrl: "https://dev.example/api",
            agentSkillSource: { ...dev, verifiedAt: new Date().toISOString() }
        };
        const prodProfile = {
            baseUrl: "https://prod.example/api",
            agentSkillSource: { ...prod, verifiedAt: new Date().toISOString() }
        };
        await saveConfig({
            activeProfile: "dev",
            profiles: { dev: devProfile, prod: prodProfile }
        });
        await activateAgentSkillSource(prod, "prod");
        const journal = path.join(
            process.env.XDG_DATA_HOME!,
            "mgd",
            "agent-skills",
            "profile-transition.json"
        );
        await fs.writeFile(
            journal,
            JSON.stringify({
                version: 1,
                fromProfile: "dev",
                fromSource: dev,
                toProfile: "prod",
                toSource: prod,
                finalConfig: {
                    activeProfile: "prod",
                    profiles: { dev: devProfile, prod: prodProfile }
                }
            })
        );
        expect((await loadConfig()).activeProfile).to.equal("dev");
        expect(await recoverAgentSkillProfileTransition()).to.equal(true);
        expect((await loadConfig()).activeProfile).to.equal("prod");
        expect(
            await fs.readFile(
                path.join(activeRoot, "switchable", "SKILL.md"),
                "utf8"
            )
        ).to.equal(markdown("Prod content"));
        let journalExists = true;
        try {
            await fs.stat(journal);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT")
                journalExists = false;
            else throw error;
        }
        expect(journalExists).to.equal(false);
    });

    it("deactivates managed skills for an uncached profile", async () => {
        const dev = await seed("https://dev.example/api", "Dev content");
        await saveConfig({
            activeProfile: "dev",
            profiles: {
                dev: {
                    baseUrl: "https://dev.example/api",
                    agentSkillSource: {
                        ...dev,
                        verifiedAt: new Date().toISOString()
                    }
                },
                empty: { baseUrl: "https://empty.example/api" }
            }
        });
        await activateAgentSkillSource(dev, "dev");
        await runUse("empty");
        let exists = true;
        try {
            await fs.stat(path.join(activeRoot, "switchable"));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT")
                exists = false;
            else throw error;
        }
        expect(exists).to.equal(false);
    });
});
