import { expect } from "chai";
import http from "node:http";
import { AddressInfo, Socket } from "node:net";
import jwt from "jsonwebtoken";
import request from "supertest";
import buildApp from "../buildApp.js";
import { AgentManager } from "../manager.js";
import { RuntimeProxy } from "../runtimeProxy.js";
import { AgentKubernetesClient } from "../kubernetes.js";
import { ManagerConfig } from "../types.js";

const jwtSecret = "workspace-access-secret";
const ADMIN_ROLE_ID = "00000000-0000-0003-0000-000000000000";
const AUTHENTICATED_ROLE_ID = "00000000-0000-0002-0000-000000000000";
const alice = "00000000-0000-4000-8000-00000000a11c";
const bob = "00000000-0000-4000-8000-000000000b0b";

function config(overrides: Partial<ManagerConfig> = {}): ManagerConfig {
    return {
        port: 8080,
        jwtSecret,
        namespace: "magda-agent",
        installationId: "a1b2c3d4e5f6",
        warmPool: "pool",
        authApiUrl: "http://authorization-api/v0",
        registryApiUrl: "http://registry-api/v0",
        storageApiUrl: "http://storage-api/v0",
        defaultStorageBucket: "magda-datasets",
        tenantId: 0,
        skillArchiveMaxCompressedBytes: 64,
        skillArchiveMaxUncompressedBytes: 1024,
        skillArchiveMaxEntries: 16,
        skillArchiveMaxPathLength: 120,
        skillArchiveMaxNestingDepth: 5,
        skillArchiveMaxMarkdownBytes: 512,
        systemUserId: "00000000-0000-4000-8000-000000000000",
        managedApiKeyName: "agent-key",
        externalUrl: "https://magda.test",
        externalAuthority: "magda.test",
        runtimePrefix: "/v0/runtime",
        sandboxPort: 3080,
        agentContainer: "agent",
        launchTokenFile: "/token",
        bootstrapCommand: "/bootstrap",
        magdaApiUrl: "https://magda.test/api",
        llmApiUrl: "https://magda.test/api/v0/llm/v1",
        llmModel: "model",
        llmContextWindow: 1000,
        llmMaxTokens: 100,
        hardDeleteSeconds: 100,
        idleSuspendSeconds: 50,
        reconcileIntervalSeconds: 10,
        runtimeMaxBodyBytes: 1024,
        controlPlaneSecret: "control",
        ...overrides
    };
}

function token(id: string, secret = jwtSecret): string {
    return jwt.sign({ userId: id }, secret, { algorithm: "HS256" });
}

/**
 * A fake Authorization API. `granted` models the current OPA decision for
 * `agentWorkspace/access`; admins are allowed by the entrypoint override, so
 * the fake mirrors that rule instead of the Manager knowing about roles.
 */
class FakeAuthorizationApi {
    granted = new Set<string>();
    admins = new Set<string>();
    decisionStatus = 200;
    residual = false;
    decisionCalls: Array<{ url: string; session: string | null }> = [];

    install() {
        const original = globalThis.fetch;
        globalThis.fetch = (async (
            input: string | URL | Request,
            init?: RequestInit
        ) => {
            const url = String(input);
            const session = new Headers(init?.headers).get("X-Magda-Session");
            let userId: string | undefined;
            try {
                userId = (jwt.verify(session || "", jwtSecret) as {
                    userId: string;
                }).userId;
            } catch {
                return new Response("{}", { status: 401 });
            }
            if (url.endsWith("/public/users/whoami")) {
                return Response.json({
                    id: userId,
                    roles: [
                        { id: AUTHENTICATED_ROLE_ID },
                        ...(this.admins.has(userId)
                            ? [{ id: ADMIN_ROLE_ID }]
                            : [])
                    ]
                });
            }
            if (url.includes("/opa/decision/")) {
                this.decisionCalls.push({ url, session });
                if (this.decisionStatus !== 200) {
                    return new Response("unavailable", {
                        status: this.decisionStatus
                    });
                }
                return Response.json({
                    hasResidualRules: this.residual,
                    result: this.granted.has(userId) || this.admins.has(userId)
                });
            }
            return new Response("not found", { status: 404 });
        }) as typeof globalThis.fetch;
        return () => {
            globalThis.fetch = original;
        };
    }
}

function recordingManager() {
    const calls: Array<{ method: string; userId: string }> = [];
    const record = (method: string) => async (userId: string) => {
        calls.push({ method, userId });
        return { state: "READY" };
    };
    return {
        calls,
        manager: ({
            status: record("status"),
            start: record("start"),
            resume: record("resume"),
            reset: record("reset"),
            delete: record("delete"),
            retrySkillSync: async (userId: string) => {
                calls.push({ method: "retrySkillSync", userId });
                return {
                    completed: true,
                    deduplicated: false,
                    skillSync: { status: "success" }
                };
            }
        } as unknown) as AgentManager
    };
}

const lifecycleRoutes: Array<["get" | "post" | "delete", string, string]> = [
    ["get", "/v0/session", "status"],
    ["post", "/v0/session", "start"],
    ["post", "/v0/session/resume", "resume"],
    ["post", "/v0/session/reset", "reset"],
    ["delete", "/v0/session", "delete"],
    ["post", "/v0/session/skill-sync/retry", "retrySkillSync"]
];

describe("agentWorkspace/access on lifecycle routes", () => {
    let auth: FakeAuthorizationApi;
    let restore: () => void;

    beforeEach(() => {
        auth = new FakeAuthorizationApi();
        restore = auth.install();
    });
    afterEach(() => restore());

    it("rejects anonymous and forged sessions before the Manager runs", async () => {
        const { calls, manager } = recordingManager();
        const app = buildApp(config(), manager);
        auth.granted.add(alice);
        for (const [method, path] of lifecycleRoutes) {
            expect((await request(app)[method](path)).status).to.equal(401);
            const forged = await request(app)
                [method](path)
                .set("X-Magda-Session", token(alice, "attacker-secret"));
            expect(forged.status).to.equal(401);
            // Identity headers a browser might try to inject are ignored.
            const spoofed = await request(app)
                [method](path)
                .set("X-Magda-User-Id", alice)
                .set("X-Magda-Agent-User", alice);
            expect(spoofed.status).to.equal(401);
        }
        expect(calls).to.deep.equal([]);
        expect(auth.decisionCalls).to.deep.equal([]);
    });

    it("denies an authenticated user without the operation on every route", async () => {
        const { calls, manager } = recordingManager();
        const app = buildApp(config(), manager);
        for (const [method, path] of lifecycleRoutes) {
            const response = await request(app)
                [method](path)
                .set("X-Magda-Session", token(bob));
            expect(response.status, `${method} ${path}`).to.equal(403);
        }
        expect(calls).to.deep.equal([]);
        expect(auth.decisionCalls).to.have.lengthOf(lifecycleRoutes.length);
        for (const call of auth.decisionCalls) {
            expect(call.url).to.equal(
                "http://authorization-api/v0/opa/decision/agentWorkspace/access?unknowns="
            );
            expect(call.session).to.equal(token(bob));
        }
    });

    it("lets a granted non-admin operate only their own Workspace", async () => {
        const { calls, manager } = recordingManager();
        const app = buildApp(config(), manager);
        auth.granted.add(bob);
        for (const [method, path] of lifecycleRoutes) {
            const response = await request(app)
                [method](`${path}?userId=${alice}`)
                .set("X-Magda-Session", token(bob))
                .set("X-Magda-User-Id", alice)
                .send({ userId: alice, sandbox: "alice-sandbox" });
            expect(response.status, `${method} ${path}`).to.be.oneOf([
                200,
                202
            ]);
        }
        expect(calls.map((call) => call.method)).to.deep.equal(
            lifecycleRoutes.map(([, , method]) => method)
        );
        expect(calls.every((call) => call.userId === bob)).to.equal(true);
    });

    it("keeps administrators on their own Workspace through the policy override", async () => {
        const { calls, manager } = recordingManager();
        const app = buildApp(config(), manager);
        auth.admins.add(alice);
        const response = await request(app)
            .post(`/v0/session?userId=${bob}`)
            .set("X-Magda-Session", token(alice))
            .send({ userId: bob });
        expect(response.status).to.equal(202);
        expect(calls).to.deep.equal([{ method: "start", userId: alice }]);
    });

    it("does not treat an administrator role as access when the policy denies it", async () => {
        // The Manager no longer hard-codes the admin role; only the decision counts.
        const { calls, manager } = recordingManager();
        const app = buildApp(config(), manager);
        auth.admins.add(alice);
        auth.residual = true;
        const response = await request(app)
            .get("/v0/session")
            .set("X-Magda-Session", token(alice));
        expect(response.status).to.equal(403);
        expect(calls).to.deep.equal([]);
    });

    it("applies revocation to the next request", async () => {
        const { calls, manager } = recordingManager();
        const app = buildApp(config(), manager);
        auth.granted.add(bob);
        expect(
            (
                await request(app)
                    .get("/v0/session")
                    .set("X-Magda-Session", token(bob))
            ).status
        ).to.equal(200);
        auth.granted.delete(bob);
        expect(
            (
                await request(app)
                    .get("/v0/session")
                    .set("X-Magda-Session", token(bob))
            ).status
        ).to.equal(403);
        expect(calls).to.have.lengthOf(1);
    });

    it("fails closed with 503 when the policy engine is unavailable", async () => {
        const { calls, manager } = recordingManager();
        const app = buildApp(config(), manager);
        auth.granted.add(bob);
        auth.decisionStatus = 500;
        const originalError = console.error;
        console.error = () => undefined;
        try {
            const response = await request(app)
                .post("/v0/session")
                .set("X-Magda-Session", token(bob));
            expect(response.status).to.equal(503);
        } finally {
            console.error = originalError;
        }
        expect(calls).to.deep.equal([]);
    });
});

/**
 * Real HTTP/WebSocket plumbing: a fake DSH upstream, the RuntimeProxy behind
 * a Node server, and a fake Kubernetes client that records which user's claim
 * is resolved.
 */
describe("agentWorkspace/access on the DSH runtime proxy", () => {
    let auth: FakeAuthorizationApi;
    let restore: () => void;
    let upstream: http.Server;
    let proxyServer: http.Server;
    let proxy: RuntimeProxy;
    let proxyPort: number;
    let claimLookups: string[];
    let upstreamUpgrades: number;
    let upgradedSockets: Socket[];
    let upstreamBodyBytes: number[];
    // The fake DSH's session cookie and upload route.
    let issuedCookie: string;
    let validCookie: string;
    let tokenExchanges: number;
    let uploadChecks: number;
    let uploads: number[];
    let rejectNextUpload: boolean;
    let failExchanges: boolean;
    let holdUploads: boolean;
    let releaseUploads: () => void;

    beforeEach(async () => {
        auth = new FakeAuthorizationApi();
        restore = auth.install();
        claimLookups = [];
        upstreamUpgrades = 0;
        upgradedSockets = [];
        upstreamBodyBytes = [];
        issuedCookie = validCookie = "dsh=managed";
        tokenExchanges = uploadChecks = 0;
        uploads = [];
        rejectNextUpload = holdUploads = failExchanges = false;
        releaseUploads = () => undefined;
        upstream = http.createServer((req, res) => {
            if (req.url?.startsWith("/?token=")) {
                tokenExchanges += 1;
                // Renewals (any exchange after the first) fail.
                if (failExchanges && tokenExchanges > 1) {
                    res.writeHead(500);
                    res.end();
                    return;
                }
                res.writeHead(303, { "set-cookie": `${issuedCookie}; Path=/` });
                res.end();
                return;
            }
            if (req.url?.split("?", 1)[0] === "/api/session/uploadFileBinary") {
                // As DSH: authenticate, then require the octet-stream type
                // before reading the body.
                const refuse = (status: number) => {
                    req.resume();
                    res.writeHead(status);
                    res.end();
                };
                if (req.headers.cookie !== validCookie) return refuse(401);
                if (
                    req.headers["content-type"] !== "application/octet-stream"
                ) {
                    uploadChecks += 1;
                    return refuse(415);
                }
                if (rejectNextUpload) {
                    rejectNextUpload = false;
                    return refuse(401);
                }
                if (holdUploads) {
                    req.pause();
                    releaseUploads = () => req.resume();
                }
                let bytes = 0;
                req.on("data", (chunk: Buffer) => (bytes += chunk.length));
                req.on("end", () => {
                    uploads.push(bytes);
                    res.writeHead(200, { "content-type": "application/json" });
                    res.end(JSON.stringify({ ok: true, bytes }));
                });
                return;
            }
            let bytes = 0;
            req.on("data", (chunk: Buffer) => (bytes += chunk.length));
            req.on("end", () => {
                upstreamBodyBytes.push(bytes);
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ path: req.url }));
            });
        });
        upstream.on("upgrade", (_req, socket: Socket) => {
            upstreamUpgrades += 1;
            upgradedSockets.push(socket);
            socket.write(
                "HTTP/1.1 101 Switching Protocols\r\n" +
                    "Upgrade: websocket\r\nConnection: Upgrade\r\n\r\n"
            );
            socket.on("data", (chunk) => socket.write(chunk));
        });
        await new Promise<void>((resolve) =>
            upstream.listen(0, "127.0.0.1", resolve)
        );
        const sandboxPort = (upstream.address() as AddressInfo).port;
        const kubernetes = ({
            status: async (userId: string) => {
                claimLookups.push(userId);
                return { state: "READY" };
            },
            getClaim: async (userId: string) => ({
                status: { sandbox: { name: `sandbox-${userId}` } }
            }),
            getSandbox: async () => ({
                status: { serviceFQDN: "127.0.0.1" }
            }),
            readLaunchToken: async () => "launch-token"
        } as unknown) as AgentKubernetesClient;
        proxy = new RuntimeProxy(
            config({
                sandboxPort,
                runtimeAuthRecheckSeconds: 3600,
                runtimeMaxUploadBytes: 2 * 1024 * 1024,
                runtimeLingerLimits: {
                    lingerSeconds: 2,
                    maxDiscardBytes: 4 * 1024 * 1024
                }
            }),
            kubernetes
        );
        proxyServer = http.createServer((req, res) =>
            proxy.handleHttp(req, res)
        );
        proxyServer.on("upgrade", (req, socket, head) =>
            proxy.handleUpgrade(req, socket, head)
        );
        await new Promise<void>((resolve) =>
            proxyServer.listen(0, "127.0.0.1", resolve)
        );
        proxyPort = (proxyServer.address() as AddressInfo).port;
    });

    afterEach(async () => {
        proxy.closeAll();
        upgradedSockets.forEach((socket) => socket.destroy());
        proxyServer.closeAllConnections();
        upstream.closeAllConnections();
        await new Promise((resolve) => proxyServer.close(resolve));
        await new Promise((resolve) => upstream.close(resolve));
        restore();
    });

    function httpGet(path: string, session?: string) {
        return new Promise<{ status: number; body: string }>(
            (resolve, reject) => {
                http.get(
                    {
                        host: "127.0.0.1",
                        port: proxyPort,
                        path,
                        headers: session ? { "X-Magda-Session": session } : {}
                    },
                    (res) => {
                        let body = "";
                        res.on("data", (chunk) => (body += chunk));
                        res.on("end", () =>
                            resolve({ status: res.statusCode || 0, body })
                        );
                    }
                ).on("error", reject);
            }
        );
    }

    /**
     * POST `chunks` of `chunkBytes` each, one write at a time, so the proxy
     * can answer while the client is still sending. A proxy that closes the
     * connection mid-upload is reported as `error`: behind the gateway that
     * close is an EPIPE, which the gateway turns into a 500.
     */
    function postInChunks(
        path: string,
        session: string,
        chunks: number,
        chunkBytes: number,
        { chunked = false, progress = { written: 0 } } = {}
    ) {
        return new Promise<{ status?: number; body?: string; error?: string }>(
            (resolve) => {
                const req = http.request({
                    host: "127.0.0.1",
                    port: proxyPort,
                    method: "POST",
                    path,
                    headers: {
                        "X-Magda-Session": session,
                        // As the gateway's http-proxy sends upstream.
                        connection: "close",
                        "content-type": "application/octet-stream",
                        ...(chunked
                            ? { "transfer-encoding": "chunked" }
                            : { "content-length": String(chunks * chunkBytes) })
                    }
                });
                let response: { status: number; body: string } | undefined;
                let written = 0;
                let sent = false;
                let settled = false;
                let closed = false;
                // Settles with the response once it's complete and the
                // request is done: fully sent, or its connection closed after
                // the response (Node's client stops sending when a response
                // says `Connection: close`). An error or a close before any
                // response is reported as `error`.
                const settle = (result?: { error: string }) => {
                    if (settled) return;
                    if (result && response) result = undefined;
                    if (!result && !(response && (sent || closed))) return;
                    settled = true;
                    resolve(result || response!);
                };
                req.on("response", (res) => {
                    let body = "";
                    res.on("data", (chunk) => (body += chunk));
                    res.on("end", () => {
                        response = { status: res.statusCode || 0, body };
                        settle();
                    });
                });
                req.on("error", (error: NodeJS.ErrnoException) =>
                    settle({ error: error.code || error.message })
                );
                req.on("close", () => {
                    closed = true;
                    if (!sent) {
                        settle({
                            error: `closed after ${written} of ${chunks} chunks`
                        });
                    }
                });
                const writeNext = () => {
                    if (written === chunks) {
                        req.end(() => {
                            sent = true;
                            settle();
                        });
                        return;
                    }
                    written += 1;
                    progress.written = written;
                    req.write(Buffer.alloc(chunkBytes, 1), (error) => {
                        if (!error) setImmediate(writeNext);
                    });
                };
                writeNext();
            }
        );
    }

    /**
     * POST over a raw socket that keeps writing its whole body regardless of
     * the response, as the Gateway's proxy did and as curl does. A proxy that
     * answers early and closes makes those writes fail, which the Gateway
     * turned into a 500.
     */
    function postIgnoringResponse(
        path: string,
        session: string,
        chunks: number,
        chunkBytes: number
    ) {
        return new Promise<{
            status?: number;
            body?: string;
            sentBytes: number;
            writeError?: string;
        }>((resolve) => {
            const socket = new Socket();
            let received = "";
            let sentBytes = 0;
            let writeError: string | undefined;
            const finish = () => {
                const [head, ...rest] = received.split("\r\n\r\n");
                const status = Number(head.split(" ")[1]) || undefined;
                resolve({
                    status,
                    body: rest.join("\r\n\r\n"),
                    sentBytes,
                    writeError
                });
            };
            socket.on("data", (chunk) => (received += chunk));
            socket.on("error", (error: NodeJS.ErrnoException) => {
                writeError = writeError || error.code || error.message;
            });
            socket.on("close", finish);
            socket.connect(proxyPort, "127.0.0.1", () => {
                socket.write(
                    `POST ${path} HTTP/1.1\r\nHost: magda.test\r\n` +
                        `X-Magda-Session: ${session}\r\nConnection: close\r\n` +
                        "Content-Type: application/octet-stream\r\n" +
                        `Content-Length: ${chunks * chunkBytes}\r\n\r\n`
                );
                let written = 0;
                const next = () => {
                    if (written === chunks) return;
                    written += 1;
                    socket.write(Buffer.alloc(chunkBytes, 1), (error) => {
                        if (error) return;
                        sentBytes += chunkBytes;
                        setImmediate(next);
                    });
                };
                next();
            });
        });
    }

    function upgrade(path: string, session?: string) {
        return new Promise<{ status: number; socket?: Socket }>(
            (resolve, reject) => {
                const req = http.request({
                    host: "127.0.0.1",
                    port: proxyPort,
                    path,
                    headers: {
                        Connection: "Upgrade",
                        Upgrade: "websocket",
                        ...(session ? { "X-Magda-Session": session } : {})
                    }
                });
                req.on("upgrade", (res, socket) =>
                    resolve({ status: res.statusCode || 0, socket })
                );
                req.on("response", (res) => {
                    res.resume();
                    resolve({ status: res.statusCode || 0 });
                });
                req.on("error", reject);
                req.end();
            }
        );
    }

    it("rejects anonymous, forged and unassigned runtime HTTP requests", async () => {
        auth.granted.add(alice);
        expect((await httpGet("/v0/runtime/api/session/list")).status).to.equal(
            401
        );
        expect(
            (
                await httpGet(
                    "/v0/runtime/api/session/list",
                    token(alice, "attacker-secret")
                )
            ).status
        ).to.equal(401);
        expect(
            (await httpGet("/v0/runtime/api/session/list", token(bob))).status
        ).to.equal(403);
        expect(claimLookups).to.deep.equal([]);
    });

    it("rejects anonymous, forged and unassigned WebSocket upgrades", async () => {
        auth.granted.add(alice);
        expect((await upgrade("/v0/runtime/ws")).status).to.equal(401);
        expect(
            (await upgrade("/v0/runtime/ws", token(alice, "attacker-secret")))
                .status
        ).to.equal(401);
        expect((await upgrade("/v0/runtime/ws", token(bob))).status).to.equal(
            403
        );
        expect(claimLookups).to.deep.equal([]);
        expect(upstreamUpgrades).to.equal(0);
    });

    it("routes a granted user's HTTP and WebSocket to their own Sandbox only", async () => {
        auth.granted.add(bob);
        const response = await httpGet(
            `/v0/runtime/api/session/list?userId=${alice}&sandbox=sandbox-${alice}`,
            token(bob)
        );
        expect(response.status).to.equal(200);
        const ws = await upgrade(`/v0/runtime/ws?userId=${alice}`, token(bob));
        expect(ws.status).to.equal(101);
        ws.socket!.destroy();
        expect(claimLookups).to.deep.equal([bob, bob]);
        expect(upstreamUpgrades).to.equal(1);
    });

    it("forwards a buffered runtime request body within the size limit", async () => {
        auth.granted.add(bob);
        const response = await postInChunks(
            "/v0/runtime/api/session/prompt",
            token(bob),
            4,
            256
        );
        expect(response.status).to.equal(200);
        expect(upstreamBodyBytes).to.deep.equal([1024]);
    });

    for (const chunked of [false, true]) {
        it(`answers 413 to an oversized buffered ${
            chunked ? "chunked" : "Content-Length"
        } request without resetting the connection`, async () => {
            auth.granted.add(bob);
            const response = await postInChunks(
                "/v0/runtime/api/session/prompt",
                token(bob),
                256,
                16 * 1024,
                { chunked }
            );
            expect(response.error).to.equal(undefined);
            expect(response.status).to.equal(413);
            expect(JSON.parse(response.body!).message).to.equal(
                "Agent runtime request body is too large"
            );
            expect(upstreamBodyBytes).to.deep.equal([]);
        });
    }

    const upload =
        "/v0/runtime/api/session/uploadFileBinary?sessionId=s&name=f";

    it("streams an upload past the buffered limit, with backpressure", async () => {
        auth.granted.add(bob);
        holdUploads = true;
        const progress = { written: 0 };
        const pending = postInChunks(upload, token(bob), 64, 32 * 1024, {
            progress
        });
        // DSH isn't reading yet. A buffering proxy would accept the whole
        // upload; a streaming one holds the client back.
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(progress.written).to.be.below(64);
        releaseUploads();
        const response = await pending;
        expect(response.status).to.equal(200);
        expect(uploads).to.deep.equal([64 * 32 * 1024]);
        expect(uploadChecks).to.equal(0);
    });

    for (const chunked of [false, true]) {
        it(`answers 413 to an upload over the upload limit (${
            chunked ? "chunked" : "Content-Length"
        }) without resetting the connection`, async () => {
            auth.granted.add(bob);
            const response = await postInChunks(
                upload,
                token(bob),
                128,
                32 * 1024,
                {
                    chunked
                }
            );
            expect(response.error).to.equal(undefined);
            expect(response.status).to.equal(413);
            expect(JSON.parse(response.body!).message).to.equal(
                "Agent runtime upload is larger than the 2097152-byte limit"
            );
            expect(uploads).to.deep.equal([]);
        });
    }

    it("checks a cached DSH cookie before streaming and refreshes a stale one", async () => {
        auth.granted.add(bob);
        const first = await postInChunks(upload, token(bob), 4, 1024);
        expect(first.status).to.equal(200);
        // A freshly exchanged cookie isn't checked.
        expect([tokenExchanges, uploadChecks]).to.deep.equal([1, 0]);

        // DSH restarts with a new session secret: the cached cookie is stale.
        issuedCookie = validCookie = "dsh=rotated";
        const second = await postInChunks(upload, token(bob), 4, 1024);
        expect(second.status).to.equal(200);
        expect([tokenExchanges, uploadChecks]).to.deep.equal([2, 0]);

        // A valid cached cookie passes the check without an exchange.
        const third = await postInChunks(upload, token(bob), 4, 1024);
        expect(third.status).to.equal(200);
        expect([tokenExchanges, uploadChecks]).to.deep.equal([2, 1]);
        expect(uploads).to.deep.equal([4096, 4096, 4096]);
    });

    for (const [label, session, status] of [
        ["a forged session", () => token(bob, "attacker-secret"), 401],
        ["revoked access", () => token(bob), 403],
        ["an upload over the upload limit", () => token(bob), 413]
    ] as const) {
        it(`answers ${status} to ${label} and reads the rest of the body, while the client keeps sending`, async () => {
            if (status !== 403) auth.granted.add(bob);
            const chunks = status === 413 ? 128 : 64;
            const result = await postIgnoringResponse(
                upload,
                session(),
                chunks,
                32 * 1024
            );
            expect(result.status).to.equal(status);
            // The raw body may be chunk-encoded: take its JSON document.
            const json = /\{.*\}/s.exec(result.body || "")?.[0] || "{}";
            expect(JSON.parse(json).message).to.be.a("string");
            expect(result.writeError).to.equal(undefined);
            expect(result.sentBytes).to.equal(chunks * 32 * 1024);
            expect(uploads).to.deep.equal([]);
        });
    }

    it("stops reading a rejected upload at the discard limit and closes the connection", async () => {
        const result = await postIgnoringResponse(
            upload,
            token(bob, "attacker-secret"),
            256,
            32 * 1024
        );
        expect(result.status).to.equal(401);
        expect(result.sentBytes).to.be.at.least(4 * 1024 * 1024);
        expect(result.sentBytes).to.be.below(256 * 32 * 1024);
    });

    it("never runs a request pipelined after an early answer", async () => {
        auth.granted.add(bob);
        const raw = await new Promise<string>((resolve) => {
            const socket = new Socket();
            let data = "";
            socket.on("data", (chunk) => (data += chunk));
            socket.on("error", () => undefined);
            socket.on("close", () => resolve(data));
            socket.connect(proxyPort, "127.0.0.1", async () => {
                socket.write(
                    `POST ${upload} HTTP/1.1\r\nHost: magda.test\r\n` +
                        `X-Magda-Session: ${token(
                            bob,
                            "attacker-secret"
                        )}\r\n` +
                        "Content-Length: 2000\r\n\r\n" +
                        "x".repeat(1000)
                );
                while (!data.includes("HTTP/1.1")) {
                    await new Promise((r) => setTimeout(r, 10));
                }
                socket.write(
                    "x".repeat(1000) +
                        "POST /v0/runtime/api/session/prompt HTTP/1.1\r\n" +
                        `Host: magda.test\r\nX-Magda-Session: ${token(
                            bob
                        )}\r\n` +
                        "Content-Length: 2\r\n\r\n{}"
                );
            });
        });
        expect(raw.match(/HTTP\/1\.1 \d{3}/g)).to.deep.equal(["HTTP/1.1 401"]);
        // Time for a pipelined request that did run to reach DSH.
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(upstreamBodyBytes).to.deep.equal([]);
    });

    it("leaves no connection behind when the client goes away during the drain", async () => {
        await new Promise<void>((resolve) => {
            const req = http.request({
                host: "127.0.0.1",
                port: proxyPort,
                method: "POST",
                path: upload,
                headers: {
                    "X-Magda-Session": token(bob, "attacker-secret"),
                    "content-length": String(1024 * 1024)
                }
            });
            req.on("error", () => undefined);
            req.on("response", (res) => {
                res.resume();
                req.destroy();
                resolve();
            });
            req.write(Buffer.alloc(16 * 1024, 1));
        });
        await new Promise((resolve) => setTimeout(resolve, 200));
        const open = await new Promise<number>((resolve, reject) =>
            proxyServer.getConnections((error, count) =>
                error ? reject(error) : resolve(count)
            )
        );
        expect(open).to.equal(0);
    });

    it("logs a failed cookie renewal and still answers a retryable 503", async () => {
        auth.granted.add(bob);
        rejectNextUpload = failExchanges = true;
        const logged: string[] = [];
        const originalError = console.error;
        console.error = (...args: unknown[]) => logged.push(String(args[0]));
        try {
            // The first exchange succeeds; the renewal after DSH's 401 fails.
            const refused = await postInChunks(upload, token(bob), 4, 1024);
            expect(refused.status).to.equal(503);
        } finally {
            console.error = originalError;
        }
        expect(logged).to.include(
            "Agent runtime cookie renewal failed for sandbox-" + bob
        );
    });

    it("answers a retryable 503 when DSH refuses the streamed upload's cookie", async () => {
        auth.granted.add(bob);
        rejectNextUpload = true;
        const refused = await postInChunks(upload, token(bob), 64, 16 * 1024);
        expect(refused.error).to.equal(undefined);
        expect(refused.status).to.equal(503);
        expect(JSON.parse(refused.body!).message).to.equal(
            "Agent runtime session expired; retry the upload"
        );
        // The cookie was renewed before answering, so the retry needs none.
        expect(tokenExchanges).to.equal(2);
        const retried = await postInChunks(upload, token(bob), 4, 1024);
        expect(retried.status).to.equal(200);
        expect(tokenExchanges).to.equal(2);
        expect(uploads).to.deep.equal([4096]);
    });

    it("closes an open WebSocket after revocation but survives a policy outage", async () => {
        auth.granted.add(bob);
        const ws = await upgrade("/v0/runtime/ws", token(bob));
        expect(ws.status).to.equal(101);
        const closed = new Promise<void>((resolve) =>
            ws.socket!.once("close", () => resolve())
        );
        const echoed = new Promise<string>((resolve) =>
            ws.socket!.once("data", (chunk) => resolve(String(chunk)))
        );
        ws.socket!.write("ping");
        expect(await echoed).to.equal("ping");

        // A transient authorization outage must not drop live work.
        auth.decisionStatus = 503;
        const originalError = console.error;
        console.error = () => undefined;
        try {
            await proxy.recheckSocketAuthorization();
        } finally {
            console.error = originalError;
        }
        expect(ws.socket!.destroyed).to.equal(false);

        auth.decisionStatus = 200;
        auth.granted.delete(bob);
        await proxy.recheckSocketAuthorization();
        await closed;
        expect((await upgrade("/v0/runtime/ws", token(bob))).status).to.equal(
            403
        );
    });
});
