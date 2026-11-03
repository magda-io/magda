import { expect } from "chai";
import fs from "node:fs/promises";
import http from "node:http";
import { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { MagdaClient } from "../client.js";
import { MgdApiError } from "../errors.js";
import { printError } from "../output.js";
import { registerAgentSkillCommands } from "../commands/agentSkill.js";
import { createAgentSkillArchive } from "../agentSkillArchive.js";
import {
    agentSkillSourceStatePath,
    createAgentSkillSourceIdentity
} from "../agentSkillLocalState.js";
import { captureStdout } from "./captureStdout.js";
import { startMockServer } from "./mockServer.js";

const userId = "00000000-0000-4000-8000-000000000123";
const skillId = `agent-skill-${userId}-useful-skill`;
const skillMarkdown = `---
name: useful-skill
description: A useful test skill
---

# Useful skill

Steps.
`;

function metadata(checksum: string) {
    return {
        id: skillId,
        name: "useful-skill",
        description: "A useful test skill",
        type: "user",
        userId,
        ownerId: userId,
        createdAt: "2025-01-01T00:00:00.000Z",
        createdBy: userId,
        updatedAt: "2025-01-01T00:00:00.000Z",
        updatedBy: userId,
        checksum
    };
}

const localManifestRoute = {
    method: "GET",
    path: "/api/v0/agent/skills/local-sync-manifest",
    body: {
        version: 1,
        complete: true,
        identity: { tenantId: "0", userId },
        items: [],
        warnings: [],
        sources: {
            user: { status: "complete", selected: 0, warnings: 0 },
            installations: { status: "notImplemented" }
        }
    }
};

async function closedPortUrl(): Promise<string> {
    const server = http.createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return `http://127.0.0.1:${port}`;
}

async function failure(action: () => Promise<unknown>): Promise<MgdApiError> {
    try {
        await action();
    } catch (error) {
        expect(error).to.be.instanceOf(MgdApiError);
        return error as MgdApiError;
    }
    throw new Error("expected a failure");
}

describe("mutating request outcome classification", () => {
    it("marks a write that could not connect as not sent", async () => {
        const client = new MagdaClient({ baseUrl: await closedPortUrl() });
        const error = await failure(() =>
            client.json("POST", "/v0/agent/skills/user", { body: "zip" })
        );
        expect(error.code).to.equal("network-error");
        expect(error.outcome).to.equal("not-sent");
        expect(error.message).to.include("ECONNREFUSED");
    });

    it("marks a write whose connection drops after sending as unknown, without resending it", async () => {
        const server = await startMockServer([
            {
                method: "POST",
                path: "/v0/agent/skills/user",
                handler: (req) => req.socket.destroy()
            }
        ]);
        try {
            const client = new MagdaClient({ baseUrl: server.url });
            const error = await failure(() =>
                client.json("POST", "/v0/agent/skills/user", { body: "zip" })
            );
            expect(error.status).to.equal(0);
            expect(error.outcome).to.equal("unknown");
            expect(server.requests).to.have.length(1);
        } finally {
            await server.close();
        }
    });

    it("treats a 5xx write as unknown but a 4xx write as a confirmed rejection", async () => {
        const server = await startMockServer([
            { method: "POST", path: "/fail", status: 503, body: {} },
            {
                method: "PUT",
                path: "/conflict",
                status: 409,
                body: { message: "name exists" }
            },
            { method: "GET", path: "/read", status: 503, body: {} }
        ]);
        try {
            const client = new MagdaClient({ baseUrl: server.url });
            const serverError = await failure(() =>
                client.json("POST", "/fail", { body: "x" })
            );
            expect(serverError.status).to.equal(503);
            expect(serverError.outcome).to.equal("unknown");
            const rejected = await failure(() =>
                client.json("PUT", "/conflict", { body: "x" })
            );
            expect(rejected.status).to.equal(409);
            expect(rejected.outcome).to.equal(undefined);
            const read = await failure(() =>
                client.request("GET", "/read", { retryDelayMs: 1 })
            );
            expect(read.outcome).to.equal(undefined);
            expect(
                server.requests.filter((r) => r.method === "POST")
            ).to.have.length(1);
        } finally {
            await server.close();
        }
    });

    it("treats an unreadable success response to a write as unknown", async () => {
        const server = await startMockServer([
            {
                method: "POST",
                path: "/create",
                handler: (_req, res) => {
                    res.writeHead(201, { "content-type": "application/json" });
                    res.end("{not json");
                }
            }
        ]);
        try {
            const client = new MagdaClient({ baseUrl: server.url });
            const error = await failure(() =>
                client.json("POST", "/create", { body: "x" })
            );
            expect(error.code).to.equal("response-unreadable");
            expect(error.status).to.equal(201);
            expect(error.outcome).to.equal("unknown");
        } finally {
            await server.close();
        }
    });

    it("prints the outcome and target in JSON error output", () => {
        const writes: string[] = [];
        const original = process.stderr.write.bind(process.stderr);
        (process.stderr as any).write = (chunk: string) => {
            writes.push(String(chunk));
            return true;
        };
        try {
            printError(
                new MgdApiError(
                    "Request failed",
                    0,
                    "network-error",
                    undefined,
                    "unknown",
                    { target: { operation: "create", id: skillId } }
                ),
                "json"
            );
        } finally {
            (process.stderr as any).write = original;
        }
        expect(JSON.parse(writes.join("")).error).to.deep.include({
            outcome: "unknown",
            details: { target: { operation: "create", id: skillId } }
        });
    });
});

describe("agent-skill write outcomes", () => {
    let temporaryDirectory: string;
    let originalEnv: Record<string, string | undefined>;

    async function run(argv: string[]): Promise<string> {
        const program = new Command();
        program.exitOverride();
        registerAgentSkillCommands(program);
        return captureStdout(() => program.parseAsync(argv, { from: "user" }));
    }

    async function draft(): Promise<string> {
        const directory = path.join(temporaryDirectory, "draft");
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, "SKILL.md"), skillMarkdown);
        return directory;
    }

    beforeEach(async () => {
        temporaryDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), "mgd-agent-skill-outcome-")
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

    it("reports an interrupted create as unknown with the expected publication, sending it once", async () => {
        const server = await startMockServer([
            localManifestRoute,
            {
                method: "POST",
                path: "/api/v0/agent/skills/user",
                handler: (req) => req.socket.destroy()
            }
        ]);
        process.env.MGD_BASE_URL = `${server.url}/api`;
        try {
            const directory = await draft();
            const expected = await createAgentSkillArchive(directory, "user");
            const error = await failure(() =>
                run(["agent-skill", "publish", directory, "--json"])
            );
            expect(error.outcome).to.equal("unknown");
            expect(error.details).to.deep.equal({
                target: {
                    operation: "create",
                    type: "user",
                    id: skillId,
                    name: "useful-skill",
                    checksum: expected.checksum
                }
            });
            expect(
                server.requests.filter((r) => r.method === "POST")
            ).to.have.length(1);
        } finally {
            await server.close();
        }
    });

    it("reports a name conflict as a confirmed rejection", async () => {
        const server = await startMockServer([
            localManifestRoute,
            {
                method: "POST",
                path: "/api/v0/agent/skills/user",
                status: 409,
                body: { message: "An Agent Skill with this name exists" }
            }
        ]);
        process.env.MGD_BASE_URL = `${server.url}/api`;
        try {
            const error = await failure(async () =>
                run(["agent-skill", "publish", await draft(), "--json"])
            );
            expect(error.status).to.equal(409);
            expect(error.outcome).to.equal(undefined);
            expect(error.details).to.equal(undefined);
        } finally {
            await server.close();
        }
    });

    it("fails before any request for an invalid draft", async () => {
        const server = await startMockServer([localManifestRoute]);
        process.env.MGD_BASE_URL = `${server.url}/api`;
        try {
            const directory = await draft();
            await fs.writeFile(path.join(directory, "run.sh"), "echo");
            let error: unknown;
            try {
                await run(["agent-skill", "publish", directory, "--json"]);
            } catch (e) {
                error = e;
            }
            expect((error as Error).message).to.match(/Markdown files only/);
            expect(error).not.to.be.instanceOf(MgdApiError);
            expect(server.requests).to.have.length(0);
        } finally {
            await server.close();
        }
    });

    it("reports a confirmed deletion even when local bookkeeping then fails", async () => {
        let statePath = "";
        const server = await startMockServer([
            localManifestRoute,
            {
                method: "GET",
                path: `/api/v0/agent/skills/user/${skillId}`,
                body: metadata("a".repeat(64))
            },
            {
                method: "DELETE",
                path: `/api/v0/agent/skills/user/${skillId}`,
                handler: (_req, res) => {
                    // A directory where state.json is renamed to fails the
                    // atomic save regardless of user (CI runs as root).
                    fs.rm(statePath, { force: true })
                        .then(() => fs.mkdir(statePath, { recursive: true }))
                        .then(() => fs.writeFile(path.join(statePath, "x"), ""))
                        .finally(() => {
                            res.writeHead(204);
                            res.end();
                        });
                }
            }
        ]);
        process.env.MGD_BASE_URL = `${server.url}/api`;
        statePath = agentSkillSourceStatePath(
            createAgentSkillSourceIdentity({
                baseUrl: `${server.url}/api`,
                tenantId: "0",
                userId
            })
        );
        try {
            const result = JSON.parse(
                await run([
                    "agent-skill",
                    "delete",
                    `user/${skillId}`,
                    "--json"
                ])
            );
            expect(result).to.deep.include({
                deleted: true,
                localCache: "failed"
            });
            expect(
                server.requests.filter((r) => r.method === "DELETE")
            ).to.have.length(1);
        } finally {
            await server.close();
        }
    });
});
