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

    beforeEach(async () => {
        auth = new FakeAuthorizationApi();
        restore = auth.install();
        claimLookups = [];
        upstreamUpgrades = 0;
        upgradedSockets = [];
        upstream = http.createServer((req, res) => {
            if (req.url?.startsWith("/?token=")) {
                res.writeHead(303, { "set-cookie": "dsh=managed; Path=/" });
                res.end();
                return;
            }
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ path: req.url }));
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
            config({ sandboxPort, runtimeAuthRecheckSeconds: 3600 }),
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
