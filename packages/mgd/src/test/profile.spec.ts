import { expect } from "chai";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
    configPath,
    loadConfig,
    saveConfig,
    resolveProfile,
    noProfileError,
    ConfigFile
} from "../profile.js";
import { UsageError, exitCodeFor } from "../errors.js";

describe("profile store", () => {
    let tmp: string;
    let env: NodeJS.ProcessEnv;

    beforeEach(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mgd-test-"));
        env = { XDG_CONFIG_HOME: tmp };
    });
    afterEach(async () => {
        await fs.rm(tmp, { recursive: true, force: true });
    });

    it("computes config path under XDG_CONFIG_HOME", () => {
        expect(configPath(env)).to.equal(path.join(tmp, "mgd", "config.json"));
    });

    it("returns empty config when file missing", async () => {
        const cfg = await loadConfig(env);
        expect(cfg.profiles).to.deep.equal({});
    });

    it("round-trips config with strict permissions", async () => {
        const cfg: ConfigFile = {
            activeProfile: "default",
            profiles: {
                default: {
                    baseUrl: "https://x/api",
                    apiKeyId: "id",
                    apiKey: "k"
                }
            }
        };
        await saveConfig(cfg, env);
        const stat = await fs.stat(configPath(env));
        expect(stat.mode & 0o777).to.equal(0o600);
        const dirStat = await fs.stat(path.dirname(configPath(env)));
        expect(dirStat.mode & 0o777).to.equal(0o700);
        expect(await loadConfig(env)).to.deep.equal(cfg);
    });

    it("resolves active profile from file", () => {
        const cfg: ConfigFile = {
            activeProfile: "p1",
            profiles: { p1: { baseUrl: "https://a/api" } }
        };
        const { name, profile } = resolveProfile(cfg, env);
        expect(name).to.equal("p1");
        expect(profile?.baseUrl).to.equal("https://a/api");
    });

    it("env vars override file profile", () => {
        const cfg: ConfigFile = {
            activeProfile: "p1",
            profiles: {
                p1: { baseUrl: "https://a/api", apiKeyId: "x", apiKey: "y" }
            }
        };
        const { profile } = resolveProfile(cfg, {
            ...env,
            MGD_BASE_URL: "https://b/api",
            MGD_API_KEY_ID: "id2",
            MGD_API_KEY: "key2"
        });
        expect(profile).to.deep.equal({
            baseUrl: "https://b/api",
            apiKeyId: "id2",
            apiKey: "key2"
        });
    });

    it("MGD_PROFILE selects a named profile", () => {
        const cfg: ConfigFile = {
            activeProfile: "p1",
            profiles: {
                p1: { baseUrl: "https://a/api" },
                p2: { baseUrl: "https://b/api" }
            }
        };
        const { name, profile } = resolveProfile(cfg, {
            ...env,
            MGD_PROFILE: "p2"
        });
        expect(name).to.equal("p2");
        expect(profile?.baseUrl).to.equal("https://b/api");
    });
});

describe("noProfileError", () => {
    const env: NodeJS.ProcessEnv = {};

    it("is a UsageError (exit 2)", () => {
        const e = noProfileError({ profiles: {} }, env);
        expect(e).to.be.instanceOf(UsageError);
        expect(exitCodeFor(e)).to.equal(2);
    });

    it("points to `profile create` when no profiles exist", () => {
        const e = noProfileError({ profiles: {} }, env);
        expect(e.message).to.match(/profile create/);
        expect(e.message).to.not.match(/profile use/);
    });

    it("points to `profile use` and lists profiles when some exist but none is active", () => {
        const e = noProfileError(
            {
                profiles: {
                    prod: { baseUrl: "https://a/api" },
                    dev: { baseUrl: "https://b/api" }
                }
            },
            env
        );
        expect(e.message).to.match(/profile use/);
        expect(e.message).to.match(/MGD_PROFILE/);
        expect(e.message).to.contain("prod");
        expect(e.message).to.contain("dev");
    });

    it("names the missing profile when MGD_PROFILE points to an unknown one", () => {
        const e = noProfileError(
            { profiles: { prod: { baseUrl: "https://a/api" } } },
            { ...env, MGD_PROFILE: "ghost" }
        );
        expect(e.message).to.contain("ghost");
        expect(e.message).to.match(/MGD_PROFILE/);
        expect(e.message).to.contain("prod");
    });
});
