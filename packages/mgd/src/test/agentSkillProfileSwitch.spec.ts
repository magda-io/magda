import { expect } from "chai";
import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { registerProfileCommands } from "../commands/profileCmd.js";
import { AGENT_SKILL_INSTALL_MARKER } from "../agentSkillArchive.js";
import {
    createAgentSkillSourceIdentity,
    loadAgentSkillInstallationIndex,
    loadAgentSkillSourceState
} from "../agentSkillLocalState.js";
import { syncLocalAgentSkills } from "../agentSkillSync.js";
import { loadConfig, saveConfig } from "../profile.js";
import { captureStdout } from "./captureStdout.js";
import { startMockServer } from "./mockServer.js";
import {
    FakeAgentSkillRemote,
    HarnessEnvironment,
    createHarnessEnvironment,
    pathExists,
    readSkill,
    skillMarkdown
} from "./agentSkillFixtures.js";

type Harness = "claude" | "codex" | "opencode" | "dsh";
const HARNESSES: Harness[] = ["claude", "codex", "opencode", "dsh"];

async function profile(argv: string[]): Promise<number | undefined> {
    const previous = process.exitCode;
    process.exitCode = undefined;
    const program = new Command();
    program.exitOverride();
    registerProfileCommands(program);
    await captureStdout(() =>
        program.parseAsync(["profile", ...argv], { from: "user" })
    );
    const code = process.exitCode;
    process.exitCode = previous;
    return code as number | undefined;
}

describe("offline Agent Skill profile switching", () => {
    let env: HarnessEnvironment;
    let dev: FakeAgentSkillRemote;
    let prod: FakeAgentSkillRemote;
    let originalFetch: typeof fetch;
    let fetches = 0;
    const dir = (harness: Harness, name = "alpha") =>
        path.join(env.roots[harness], name);

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
        await syncAs("dev");
        await syncAs("prod");
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
        await env.restore();
    });

    it("switches between verified account caches without network access", async () => {
        expect(await profile(["use", "dev"])).to.equal(undefined);
        expect((await loadConfig()).activeProfile).to.equal("dev");
        for (const harness of HARNESSES) {
            expect(await readSkill(dir(harness))).to.equal(
                skillMarkdown("alpha", "dev alpha")
            );
            expect(await pathExists(dir(harness, "beta"))).to.equal(false);
        }
        const devKey = createAgentSkillSourceIdentity({
            baseUrl: dev.baseUrl,
            tenantId: "7",
            userId: dev.userId
        }).key;
        expect(
            (await loadAgentSkillInstallationIndex()).activeSourceKey
        ).to.equal(devKey);

        expect(await profile(["use", "prod"])).to.equal(undefined);
        for (const harness of HARNESSES) {
            expect(await readSkill(dir(harness))).to.equal(
                skillMarkdown("alpha", "prod alpha")
            );
            expect(await readSkill(dir(harness, "beta"))).to.equal(
                skillMarkdown("beta", "prod beta")
            );
        }
        expect(fetches).to.equal(0);
        // Both accounts' verified caches survive switching.
        const prodState = await loadAgentSkillSourceState(
            createAgentSkillSourceIdentity({
                baseUrl: prod.baseUrl,
                tenantId: "7",
                userId: prod.userId
            })
        );
        expect(Object.keys(prodState.snapshot!.items)).to.have.length(2);
    });

    it("keeps the previous profile and installations on conflict; --force completes", async () => {
        await fs.writeFile(
            path.join(dir("claude"), "SKILL.md"),
            skillMarkdown("alpha", "prod edit")
        );
        const indexBefore = await loadAgentSkillInstallationIndex();

        expect(await profile(["use", "dev"])).to.equal(1);
        expect((await loadConfig()).activeProfile).to.equal("prod");
        expect(await loadAgentSkillInstallationIndex()).to.deep.equal(
            indexBefore
        );
        expect(await readSkill(dir("claude"))).to.equal(
            skillMarkdown("alpha", "prod edit")
        );
        expect(await readSkill(dir("codex", "beta"))).to.equal(
            skillMarkdown("beta", "prod beta")
        );

        expect(await profile(["use", "dev", "--force"])).to.equal(undefined);
        expect((await loadConfig()).activeProfile).to.equal("dev");
        expect(await readSkill(dir("claude"))).to.equal(
            skillMarkdown("alpha", "dev alpha")
        );
        expect(fetches).to.equal(0);
    });

    it("reinstalls missing directories and repairs exact-content metadata offline", async () => {
        await fs.rm(dir("codex"), { recursive: true });
        await fs.rm(
            path.join(dir("claude", "beta"), AGENT_SKILL_INSTALL_MARKER)
        );

        expect(await profile(["use", "prod"])).to.equal(undefined);
        expect(await readSkill(dir("codex"))).to.equal(
            skillMarkdown("alpha", "prod alpha")
        );
        expect(
            await pathExists(
                path.join(dir("claude", "beta"), AGENT_SKILL_INSTALL_MARKER)
            )
        ).to.equal(true);
        expect(fetches).to.equal(0);
    });

    it("deactivates managed skills when the target has no verified cache", async () => {
        const unrelated = path.join(env.roots.codex, "my-own");
        await fs.mkdir(unrelated);
        await fs.writeFile(path.join(unrelated, "SKILL.md"), "mine");

        expect(await profile(["use", "fresh"])).to.equal(undefined);
        expect((await loadConfig()).activeProfile).to.equal("fresh");
        for (const harness of HARNESSES) {
            expect(await pathExists(dir(harness))).to.equal(false);
            expect(await pathExists(dir(harness, "beta"))).to.equal(false);
        }
        expect(await readSkill(unrelated)).to.equal("mine");
        const index = await loadAgentSkillInstallationIndex();
        expect(index.installations).to.deep.equal({});
        expect(index.activeSourceKey).to.equal(undefined);
        expect(fetches).to.equal(0);
    });

    it("never resurrects a remotely deleted skill on a later offline switch", async () => {
        globalThis.fetch = originalFetch;
        prod.remove("beta");
        await syncAs("prod");
        expect(await pathExists(dir("claude", "beta"))).to.equal(false);
        expect(await profile(["use", "dev"])).to.equal(undefined);
        expect(await profile(["use", "prod"])).to.equal(undefined);
        for (const harness of HARNESSES)
            expect(await pathExists(dir(harness, "beta"))).to.equal(false);
    });

    it("applies --force to both the offline switch and the explicit --sync-skills refresh", async () => {
        globalThis.fetch = originalFetch;
        const live = new FakeAgentSkillRemote("", path.join(env.tmp, "live"));
        const server = await startMockServer(live.routes());
        try {
            live.baseUrl = `${server.url}/api`;
            await live.publish("gamma", "live gamma");
            const cfg = await loadConfig();
            cfg.profiles.live = { baseUrl: live.baseUrl };
            await saveConfig(cfg);
            await fs.writeFile(
                path.join(dir("dsh"), "SKILL.md"),
                skillMarkdown("alpha", "prod edit")
            );

            expect(await profile(["use", "live", "--sync-skills"])).to.equal(1);
            expect((await loadConfig()).activeProfile).to.equal("prod");
            expect(server.requests).to.have.length(0);

            expect(
                await profile(["use", "live", "--force", "--sync-skills"])
            ).to.equal(undefined);
            expect((await loadConfig()).activeProfile).to.equal("live");
            for (const harness of HARNESSES) {
                expect(await pathExists(dir(harness))).to.equal(false);
                expect(await readSkill(dir(harness, "gamma"))).to.equal(
                    skillMarkdown("gamma", "live gamma")
                );
            }
        } finally {
            await server.close();
        }
    });

    it("switches a zero-skill profile with no python3 on PATH", async () => {
        expect(process.env.PATH).to.equal(path.join(env.tmp, "empty-bin"));
        expect(await fs.readdir(process.env.PATH!)).to.deep.equal([]);
        expect(await profile(["use", "fresh"])).to.equal(undefined);
        expect(await profile(["use", "fresh"])).to.equal(undefined);
        expect((await loadConfig()).activeProfile).to.equal("fresh");
    });
});
