import { expect } from "chai";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { normalizeBaseUrl, registerAuthCommands } from "../commands/auth.js";
import { loadConfig } from "../profile.js";
import { startMockServer } from "./mockServer.js";

describe("normalizeBaseUrl", () => {
    it("prefers the input as-is when it probes OK", async () => {
        const url = await normalizeBaseUrl("https://x/api/", async (u) =>
            u === "https://x/api" ? true : false
        );
        expect(url).to.equal("https://x/api");
    });
    it("falls back to <input>/api", async () => {
        const url = await normalizeBaseUrl("https://x", async (u) =>
            u === "https://x/api" ? true : false
        );
        expect(url).to.equal("https://x/api");
    });
    it("throws when nothing probes OK", async () => {
        let err: unknown;
        try {
            await normalizeBaseUrl("https://x", async () => false);
        } catch (e) {
            err = e;
        }
        expect(err).to.be.instanceOf(Error);
    });
});

describe("auth login/status", () => {
    let tmp: string;
    const origEnv: Record<string, string | undefined> = {};

    beforeEach(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mgd-auth-"));
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

    it("logs in non-interactively, verifies whoami and saves the profile", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/auth/users/whoami",
                body: { id: "u1", displayName: "Test User" }
            }
        ]);
        try {
            const program = new Command();
            registerAuthCommands(program);
            await program.parseAsync(
                [
                    "auth",
                    "login",
                    "--url",
                    server.url,
                    "--key-id",
                    "kid",
                    "--key",
                    "kv"
                ],
                { from: "user" }
            );
            const cfg = await loadConfig();
            expect(cfg.activeProfile).to.equal("default");
            expect(cfg.profiles.default.baseUrl).to.equal(server.url);
            expect(cfg.profiles.default.apiKeyId).to.equal("kid");
        } finally {
            await server.close();
        }
    });

    it("fails login when whoami rejects the key", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/auth/users/whoami",
                handler: (req, res) => {
                    // probe (no key headers) succeeds; keyed request fails
                    if (req.headers["x-magda-api-key"]) {
                        res.writeHead(401, {
                            "content-type": "application/json"
                        }).end(JSON.stringify({ errorMessage: "bad key" }));
                    } else {
                        res.writeHead(200, {
                            "content-type": "application/json"
                        }).end(JSON.stringify({}));
                    }
                }
            }
        ]);
        try {
            const program = new Command();
            registerAuthCommands(program);
            let err: unknown;
            try {
                await program.parseAsync(
                    [
                        "auth",
                        "login",
                        "--url",
                        server.url,
                        "--key-id",
                        "kid",
                        "--key",
                        "bad"
                    ],
                    { from: "user" }
                );
            } catch (e) {
                err = e;
            }
            expect(err).to.be.instanceOf(Error);
        } finally {
            await server.close();
        }
    });
});
