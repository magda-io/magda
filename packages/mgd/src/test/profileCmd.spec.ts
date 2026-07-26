import { expect } from "chai";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { registerProfileCommands } from "../commands/profileCmd.js";
import { registerAuthCommands } from "../commands/auth.js";
import { loadConfig, saveConfig } from "../profile.js";
import { UsageError, exitCodeFor } from "../errors.js";
import { startMockServer } from "./mockServer.js";

const WHOAMI_ROUTE = {
    method: "GET",
    path: "/v0/auth/users/whoami",
    body: { id: "u1", displayName: "Test User" }
};

/** Run argv against a fresh program and return the thrown error (or undefined). */
async function run(
    register: (p: Command) => void,
    argv: string[]
): Promise<unknown> {
    const program = new Command();
    register(program);
    try {
        await program.parseAsync(argv, { from: "user" });
        return undefined;
    } catch (e) {
        return e;
    }
}

describe("profile create/update/remove", () => {
    let tmp: string;
    const origEnv: Record<string, string | undefined> = {};

    beforeEach(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mgd-profcmd-"));
        for (const k of [
            "XDG_CONFIG_HOME",
            "MGD_BASE_URL",
            "MGD_API_KEY_ID",
            "MGD_API_KEY",
            "MGD_PROFILE"
        ]) {
            origEnv[k] = process.env[k];
            delete process.env[k];
        }
        process.env.XDG_CONFIG_HOME = tmp;
    });
    afterEach(async () => {
        for (const [k, v] of Object.entries(origEnv)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
        await fs.rm(tmp, { recursive: true, force: true });
    });

    describe("create", () => {
        it("creates a profile, verifies whoami, saves and activates it", async () => {
            const server = await startMockServer([WHOAMI_ROUTE]);
            try {
                const err = await run(registerProfileCommands, [
                    "profile",
                    "create",
                    "prod",
                    "--url",
                    server.url,
                    "--key-id",
                    "kid",
                    "--key",
                    "kv"
                ]);
                expect(err).to.equal(undefined);
                const cfg = await loadConfig();
                expect(cfg.profiles.prod.baseUrl).to.equal(server.url);
                expect(cfg.profiles.prod.apiKeyId).to.equal("kid");
                expect(cfg.profiles.prod.apiKey).to.equal("kv");
                expect(cfg.activeProfile).to.equal("prod");
            } finally {
                await server.close();
            }
        });

        it("refuses to overwrite an existing profile (usage error, exit 2)", async () => {
            await saveConfig({
                activeProfile: "prod",
                profiles: { prod: { baseUrl: "https://x/api" } }
            });
            const err = await run(registerProfileCommands, [
                "profile",
                "create",
                "prod",
                "--url",
                "https://y/api",
                "--key-id",
                "",
                "--key",
                ""
            ]);
            expect(err).to.be.instanceOf(UsageError);
            expect(exitCodeFor(err)).to.equal(2);
            // untouched
            const cfg = await loadConfig();
            expect(cfg.profiles.prod.baseUrl).to.equal("https://x/api");
        });

        it("errors (exit 2) when <name> is omitted", async () => {
            const err = await run(registerProfileCommands, [
                "profile",
                "create"
            ]);
            expect(err).to.be.instanceOf(UsageError);
            expect(exitCodeFor(err)).to.equal(2);
        });
    });

    describe("update", () => {
        beforeEach(async () => {
            await saveConfig({
                activeProfile: "prod",
                profiles: {
                    prod: {
                        baseUrl: "https://x/api",
                        apiKeyId: "old",
                        apiKey: "oldkey"
                    }
                }
            });
        });

        it("patches only supplied fields, verifies, leaves the rest", async () => {
            const server = await startMockServer([WHOAMI_ROUTE]);
            try {
                // point baseUrl at the mock so verification hits it
                await saveConfig({
                    activeProfile: "prod",
                    profiles: {
                        prod: {
                            baseUrl: server.url,
                            apiKeyId: "old",
                            apiKey: "oldkey"
                        }
                    }
                });
                const err = await run(registerProfileCommands, [
                    "profile",
                    "update",
                    "prod",
                    "--key-id",
                    "new"
                ]);
                expect(err).to.equal(undefined);
                const cfg = await loadConfig();
                expect(cfg.profiles.prod.baseUrl).to.equal(server.url);
                expect(cfg.profiles.prod.apiKeyId).to.equal("new");
                // apiKey left unchanged
                expect(cfg.profiles.prod.apiKey).to.equal("oldkey");
                // active profile untouched by update
                expect(cfg.activeProfile).to.equal("prod");
            } finally {
                await server.close();
            }
        });

        it("errors (exit 2) when nothing was supplied", async () => {
            const err = await run(registerProfileCommands, [
                "profile",
                "update",
                "prod"
            ]);
            expect(err).to.be.instanceOf(UsageError);
            expect(exitCodeFor(err)).to.equal(2);
        });

        it("errors (exit 2) when the profile does not exist", async () => {
            const err = await run(registerProfileCommands, [
                "profile",
                "update",
                "ghost",
                "--key-id",
                "x"
            ]);
            expect(err).to.be.instanceOf(UsageError);
            expect(exitCodeFor(err)).to.equal(2);
        });

        it("errors (exit 2) when <name> is omitted", async () => {
            const err = await run(registerProfileCommands, [
                "profile",
                "update",
                "--key-id",
                "x"
            ]);
            expect(err).to.be.instanceOf(UsageError);
            expect(exitCodeFor(err)).to.equal(2);
        });
    });

    describe("remove", () => {
        it("deletes a profile and resets the active profile", async () => {
            await saveConfig({
                activeProfile: "prod",
                profiles: {
                    prod: { baseUrl: "https://x/api" },
                    dev: { baseUrl: "https://y/api" }
                }
            });
            const err = await run(registerProfileCommands, [
                "profile",
                "remove",
                "prod"
            ]);
            expect(err).to.equal(undefined);
            const cfg = await loadConfig();
            expect(cfg.profiles.prod).to.equal(undefined);
            expect(cfg.profiles.dev).to.not.equal(undefined);
            // active reset away from the removed profile
            expect(cfg.activeProfile ?? "default").to.not.equal("prod");
        });

        it("keeps activeProfile when removing a non-active profile", async () => {
            await saveConfig({
                activeProfile: "prod",
                profiles: {
                    prod: { baseUrl: "https://x/api" },
                    dev: { baseUrl: "https://y/api" }
                }
            });
            const err = await run(registerProfileCommands, [
                "profile",
                "remove",
                "dev"
            ]);
            expect(err).to.equal(undefined);
            const cfg = await loadConfig();
            expect(cfg.activeProfile).to.equal("prod");
        });

        it("errors (exit 2) when the profile does not exist", async () => {
            await saveConfig({ profiles: {} });
            const err = await run(registerProfileCommands, [
                "profile",
                "remove",
                "ghost"
            ]);
            expect(err).to.be.instanceOf(UsageError);
            expect(exitCodeFor(err)).to.equal(2);
        });

        it("errors (exit 2) when <name> is omitted", async () => {
            const err = await run(registerProfileCommands, [
                "profile",
                "remove"
            ]);
            expect(err).to.be.instanceOf(UsageError);
            expect(exitCodeFor(err)).to.equal(2);
        });
    });
});

describe("auth login (deprecated alias of profile create)", () => {
    let tmp: string;
    const origEnv: Record<string, string | undefined> = {};

    beforeEach(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mgd-authalias-"));
        for (const k of [
            "XDG_CONFIG_HOME",
            "MGD_BASE_URL",
            "MGD_API_KEY_ID",
            "MGD_API_KEY",
            "MGD_PROFILE"
        ]) {
            origEnv[k] = process.env[k];
            delete process.env[k];
        }
        process.env.XDG_CONFIG_HOME = tmp;
    });
    afterEach(async () => {
        for (const [k, v] of Object.entries(origEnv)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
        await fs.rm(tmp, { recursive: true, force: true });
    });

    it("creates the profile named by --profile (default `default`)", async () => {
        const server = await startMockServer([WHOAMI_ROUTE]);
        try {
            const err = await run(registerAuthCommands, [
                "auth",
                "login",
                "--url",
                server.url,
                "--key-id",
                "kid",
                "--key",
                "kv"
            ]);
            expect(err).to.equal(undefined);
            const cfg = await loadConfig();
            expect(cfg.profiles.default.baseUrl).to.equal(server.url);
            expect(cfg.profiles.default.apiKeyId).to.equal("kid");
            expect(cfg.activeProfile).to.equal("default");
        } finally {
            await server.close();
        }
    });

    it("refuses to overwrite an existing profile, like profile create", async () => {
        await saveConfig({
            activeProfile: "default",
            profiles: { default: { baseUrl: "https://x/api" } }
        });
        const err = await run(registerAuthCommands, [
            "auth",
            "login",
            "--url",
            "https://y/api",
            "--key-id",
            "",
            "--key",
            ""
        ]);
        expect(err).to.be.instanceOf(UsageError);
        expect(exitCodeFor(err)).to.equal(2);
    });

    it("no longer registers `auth logout`", () => {
        const program = new Command();
        registerAuthCommands(program);
        const auth = program.commands.find((c) => c.name() === "auth");
        const subs = (auth?.commands ?? []).map((c) => c.name());
        expect(subs).to.include("login");
        expect(subs).to.include("status");
        expect(subs).to.not.include("logout");
    });
});
