import { expect } from "chai";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { Command } from "commander";
import { registerProfileCommands } from "../commands/profileCmd.js";
import { AGENT_SKILL_INSTALL_MARKER } from "../agentSkillArchive.js";
import {
    createAgentSkillSourceIdentity,
    loadAgentSkillSourceState
} from "../agentSkillLocalState.js";
import { agentSkillReconcileTestHooks } from "../agentSkillReconcile.js";
import {
    cachedProfileIdentity,
    reconcileCachedAgentSkillProfile,
    syncLocalAgentSkills
} from "../agentSkillSync.js";
import { loadConfig, saveConfig } from "../profile.js";
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

type Harness = "claude" | "codex" | "opencode" | "dsh";
const HARNESSES: Harness[] = ["claude", "codex", "opencode", "dsh"];

/** Run `mgd profile ...`; returns the exit code and captured stderr notes. */
async function profile(
    argv: string[]
): Promise<{ code: number | undefined; notes: string }> {
    const previous = process.exitCode;
    process.exitCode = undefined;
    const originalStdout = process.stdout.write;
    const originalStderr = process.stderr.write;
    let notes = "";
    (process.stdout as any).write = () => true;
    (process.stderr as any).write = (chunk: any) => {
        notes += String(chunk);
        return true;
    };
    try {
        const program = new Command();
        program.exitOverride();
        registerProfileCommands(program);
        await program.parseAsync(["profile", ...argv], { from: "user" });
    } finally {
        process.stdout.write = originalStdout;
        process.stderr.write = originalStderr;
    }
    const code = process.exitCode as number | undefined;
    process.exitCode = previous;
    return { code, notes };
}

describe("commit-first Agent Skill profile switching", () => {
    let env: HarnessEnvironment;
    let dev: FakeAgentSkillRemote;
    let prod: FakeAgentSkillRemote;
    let originalFetch: typeof fetch;
    let fetches = 0;
    const dir = (harness: Harness, name = "alpha") =>
        path.join(env.roots[harness], name);
    const devKey = () =>
        createAgentSkillSourceIdentity({
            baseUrl: dev.baseUrl,
            tenantId: "7",
            userId: dev.userId
        }).key;

    async function syncAs(name: "dev" | "prod") {
        const cfg = await loadConfig();
        cfg.activeProfile = name;
        await saveConfig(cfg);
        const result = await syncLocalAgentSkills(
            (name === "dev" ? dev : prod).client(),
            { selectedProfile: name, activate: true }
        );
        expect(result.status).to.equal("success");
    }

    beforeEach(async () => {
        env = await createHarnessEnvironment("mgd-profile-switch-");
        // The same user id, record ids and names exist on both instances;
        // only the canonical instance URL separates the source identities.
        dev = new FakeAgentSkillRemote(
            "https://dev.example/api",
            path.join(env.tmp, "dev")
        );
        prod = new FakeAgentSkillRemote(
            "https://prod.example/api",
            path.join(env.tmp, "prod")
        );
        await dev.publish("alpha", "dev alpha");
        await dev.publish("devonly", "dev only");
        await prod.publish("alpha", "prod alpha");
        await prod.publish("beta", "prod beta");
        await saveConfig({
            activeProfile: "dev",
            profiles: {
                dev: { baseUrl: dev.baseUrl },
                prod: { baseUrl: prod.baseUrl },
                fresh: { baseUrl: "https://fresh.example/api" }
            }
        });
        await syncAs("prod");
        await syncAs("dev");
        originalFetch = globalThis.fetch;
        fetches = 0;
        globalThis.fetch = (async () => {
            fetches += 1;
            throw new Error(
                "offline profile switching must not use the network"
            );
        }) as typeof fetch;
    });

    afterEach(async () => {
        globalThis.fetch = originalFetch;
        delete agentSkillReconcileTestHooks.beforeOperation;
        await env.restore();
    });

    it("switches between verified account caches offline and cleans old-profile marked skills", async () => {
        const result = await profile(["use", "prod"]);
        expect(result.code).to.equal(undefined);
        expect(result.notes).to.include("Active profile: prod");
        expect((await loadConfig()).activeProfile).to.equal("prod");
        for (const harness of HARNESSES) {
            expect(await readSkill(dir(harness))).to.equal(
                skillMarkdown("alpha", "prod alpha")
            );
            expect(await readSkill(dir(harness, "beta"))).to.equal(
                skillMarkdown("beta", "prod beta")
            );
            // Dev's marked clean skill was discovered by scan and removed.
            expect(await pathExists(dir(harness, "devonly"))).to.equal(false);
        }

        expect((await profile(["use", "dev"])).code).to.equal(undefined);
        for (const harness of HARNESSES) {
            expect(await readSkill(dir(harness))).to.equal(
                skillMarkdown("alpha", "dev alpha")
            );
            expect(await pathExists(dir(harness, "beta"))).to.equal(false);
        }
        expect(fetches).to.equal(0);
    });

    it("keeps the new profile active after a conflict, names the old source, and exits nonzero", async () => {
        await fs.writeFile(
            path.join(dir("claude", "devonly"), "SKILL.md"),
            skillMarkdown("devonly", "dev edit")
        );

        const result = await profile(["use", "prod"]);
        expect(result.code).to.equal(1);
        expect((await loadConfig()).activeProfile).to.equal("prod");
        expect(result.notes).to.include("Active profile: prod");
        expect(result.notes).to.include("PARTIAL");
        expect(result.notes).to.include(dir("claude", "devonly"));
        expect(result.notes).to.include("Installed source: dev");
        expect(result.notes).to.include(
            `mgd agent-skill publish ${dir("claude", "devonly")}`
        );
        expect(await readSkill(dir("claude", "devonly"))).to.equal(
            skillMarkdown("devonly", "dev edit")
        );
        // New Prod installs are not destructive and proceed meanwhile.
        expect(await readSkill(dir("codex", "beta"))).to.equal(
            skillMarkdown("beta", "prod beta")
        );

        // A later forced reconciliation cleans the old-profile marked skill.
        const forced = await reconcileCachedAgentSkillProfile({
            identity: cachedProfileIdentity((await loadConfig()).profiles.prod),
            force: true
        });
        expect(forced!.status).to.equal("success");
        for (const harness of HARNESSES) {
            expect(await pathExists(dir(harness, "devonly"))).to.equal(false);
            expect(await readSkill(dir(harness))).to.equal(
                skillMarkdown("alpha", "prod alpha")
            );
        }
        expect(fetches).to.equal(0);
    });

    it("keeps the new profile active after a filesystem error during reconciliation", async () => {
        agentSkillReconcileTestHooks.beforeOperation = async (
            _kind,
            harness
        ) => {
            if (harness === "opencode") throw new Error("EIO: disk error");
        };
        const result = await profile(["use", "prod"]);
        expect(result.code).to.equal(1);
        expect((await loadConfig()).activeProfile).to.equal("prod");
        expect(result.notes).to.include("EIO: disk error");
        expect(await readSkill(dir("claude"))).to.equal(
            skillMarkdown("alpha", "prod alpha")
        );
        expect(await readSkill(dir("opencode"))).to.equal(
            skillMarkdown("alpha", "dev alpha")
        );
    });

    it("--force reconciles the switch without a prompt", async () => {
        await fs.writeFile(
            path.join(dir("dsh"), "SKILL.md"),
            skillMarkdown("alpha", "dev edit")
        );
        expect((await profile(["use", "prod", "--force"])).code).to.equal(
            undefined
        );
        expect(await readSkill(dir("dsh"))).to.equal(
            skillMarkdown("alpha", "prod alpha")
        );
        expect(fetches).to.equal(0);
    });

    it("reinstalls missing directories and repairs exact-content metadata offline", async () => {
        await fs.rm(dir("codex"), { recursive: true });
        await fs.rm(path.join(dir("claude"), AGENT_SKILL_INSTALL_MARKER));

        expect((await profile(["use", "dev"])).code).to.equal(undefined);
        expect(await readSkill(dir("codex"))).to.equal(
            skillMarkdown("alpha", "dev alpha")
        );
        expect((await readMarker(dir("claude"))).sourceKey).to.equal(devKey());
        expect(fetches).to.equal(0);
    });

    it("switches to an uncached profile without purging installed skills", async () => {
        const result = await profile(["use", "fresh"]);
        expect(result.code).to.equal(1);
        expect((await loadConfig()).activeProfile).to.equal("fresh");
        expect(result.notes).to.include("No verified Agent Skill cache");
        for (const harness of HARNESSES)
            expect(await readSkill(dir(harness))).to.equal(
                skillMarkdown("alpha", "dev alpha")
            );
        expect(fetches).to.equal(0);
    });

    it("never resurrects a remotely deleted skill on a later offline switch", async () => {
        globalThis.fetch = originalFetch;
        dev.remove("devonly");
        await syncAs("dev");
        expect(await pathExists(dir("claude", "devonly"))).to.equal(false);
        await profile(["use", "prod"]);
        await profile(["use", "dev"]);
        for (const harness of HARNESSES)
            expect(await pathExists(dir(harness, "devonly"))).to.equal(false);
        const state = await loadAgentSkillSourceState(
            createAgentSkillSourceIdentity({
                baseUrl: dev.baseUrl,
                tenantId: "7",
                userId: dev.userId
            })
        );
        expect(Object.keys(state.snapshot!.items)).to.have.length(1);
    });

    it("applies --force to the offline switch and the explicit --sync-skills refresh", async () => {
        globalThis.fetch = originalFetch;
        const live = new FakeAgentSkillRemote("", path.join(env.tmp, "live"));
        const server = await startMockServer(live.routes());
        try {
            live.baseUrl = `${server.url}/api`;
            await live.publish("alpha", "live alpha");
            const cfg = await loadConfig();
            cfg.profiles.live = { baseUrl: live.baseUrl };
            await saveConfig(cfg);
            await fs.writeFile(
                path.join(dir("dsh"), "SKILL.md"),
                skillMarkdown("alpha", "dev edit")
            );

            // Uncached: the offline phase changes nothing; the online phase
            // reports the conflict; the profile still switches.
            const ordinary = await profile(["use", "live", "--sync-skills"]);
            expect(ordinary.code).to.equal(1);
            expect((await loadConfig()).activeProfile).to.equal("live");
            expect(await readSkill(dir("dsh"))).to.equal(
                skillMarkdown("alpha", "dev edit")
            );

            const forced = await profile([
                "use",
                "live",
                "--force",
                "--sync-skills"
            ]);
            expect(forced.code).to.equal(undefined);
            for (const harness of HARNESSES) {
                expect(await readSkill(dir(harness))).to.equal(
                    skillMarkdown("alpha", "live alpha")
                );
                expect(await pathExists(dir(harness, "devonly"))).to.equal(
                    false
                );
            }
        } finally {
            await server.close();
        }
    });

    it("removes and updates profiles without deleting installed skills", async () => {
        expect((await profile(["remove", "dev"])).code).to.equal(undefined);
        expect((await loadConfig()).profiles.dev).to.equal(undefined);
        for (const harness of HARNESSES)
            expect(await readSkill(dir(harness))).to.equal(
                skillMarkdown("alpha", "dev alpha")
            );
    });

    describe("serialization with the operation lock", () => {
        const program = () => {
            const command = new Command();
            command.exitOverride();
            registerProfileCommands(command);
            return command;
        };

        async function assertConsistent() {
            const active = (await loadConfig()).activeProfile as "dev" | "prod";
            const remote = active === "dev" ? dev : prod;
            const key = createAgentSkillSourceIdentity({
                baseUrl: remote.baseUrl,
                tenantId: "7",
                userId: remote.userId
            }).key;
            for (const harness of HARNESSES) {
                expect((await readMarker(dir(harness))).sourceKey).to.equal(
                    key
                );
                expect(await readSkill(dir(harness))).to.equal(
                    skillMarkdown("alpha", `${active} alpha`)
                );
            }
        }

        it("never interleaves two concurrent profile switches", async () => {
            const originalStdout = process.stdout.write;
            const originalStderr = process.stderr.write;
            (process.stdout as any).write = () => true;
            (process.stderr as any).write = () => true;
            const previous = process.exitCode;
            let results: PromiseSettledResult<unknown>[];
            try {
                results = await Promise.allSettled([
                    program().parseAsync(["profile", "use", "prod"], {
                        from: "user"
                    }),
                    program().parseAsync(["profile", "use", "dev"], {
                        from: "user"
                    })
                ]);
            } finally {
                process.stdout.write = originalStdout;
                process.stderr.write = originalStderr;
                process.exitCode = previous;
            }
            expect(results.some((r) => r.status === "fulfilled")).to.equal(
                true
            );
            for (const result of results)
                if (result.status === "rejected")
                    expect(String(result.reason)).to.match(
                        /already running|lock/i
                    );
            await assertConsistent();
        });

        it("refuses while another process holds the lock, and recovers when it dies", async () => {
            const moduleUrl = new URL("../agentSkillState.ts", import.meta.url)
                .href;
            const child = spawn(
                process.execPath,
                [
                    "--import=tsx/esm",
                    "--input-type=module",
                    "-e",
                    `import { withAgentSkillStateLock } from ${JSON.stringify(
                        moduleUrl
                    )}; await withAgentSkillStateLock(async () => { console.log("locked"); await new Promise(() => setInterval(() => {}, 1000)); });`
                ],
                { env: process.env, stdio: ["ignore", "pipe", "inherit"] }
            );
            await new Promise<void>((resolve, reject) => {
                child.once("error", reject);
                child.stdout!.once("data", (chunk) =>
                    String(chunk).includes("locked")
                        ? resolve()
                        : reject(new Error("child did not acquire the lock"))
                );
            });
            let refused: unknown;
            try {
                await profile(["use", "prod"]);
            } catch (error) {
                refused = error;
            }
            expect(String(refused)).to.match(/already running|lock/i);
            // The selection write happens inside the lock, so nothing changed.
            expect((await loadConfig()).activeProfile).to.equal("dev");
            await assertConsistent();

            child.kill("SIGKILL");
            await new Promise<void>((resolve) =>
                child.once("exit", () => resolve())
            );
            expect((await profile(["use", "prod"])).code).to.equal(undefined);
            await assertConsistent();
        });
    });

    it("switches a zero-skill profile with no python3 on PATH", async () => {
        expect(process.env.PATH).to.equal(path.join(env.tmp, "empty-bin"));
        expect(await fs.readdir(process.env.PATH!)).to.deep.equal([]);
        const empty = new FakeAgentSkillRemote(
            "https://empty.example/api",
            path.join(env.tmp, "empty")
        );
        globalThis.fetch = originalFetch;
        const cfg = await loadConfig();
        cfg.profiles.empty = { baseUrl: empty.baseUrl };
        cfg.activeProfile = "empty";
        await saveConfig(cfg);
        await syncLocalAgentSkills(empty.client(), {
            selectedProfile: "empty",
            activate: true,
            force: true
        });
        expect((await profile(["use", "empty"])).code).to.equal(undefined);
        expect((await loadConfig()).activeProfile).to.equal("empty");
    });
});
