import {} from "mocha";
import { expect } from "chai";
import sinon from "sinon";
import express from "express";
import http, { IncomingMessage } from "http";
import net, { AddressInfo } from "net";
import jwt from "jsonwebtoken";

import Authenticator from "../Authenticator.js";
import setupTenantMode from "../setupTenantMode.js";
import createGenericProxyRouter from "../createGenericProxyRouter.js";
import WebSocketUpgradeHandler, {
    closeSocketGracefully
} from "../WebSocketUpgradeHandler.js";
import { Duplex } from "stream";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import {
    UnconditionalFalseDecision,
    UnconditionalTrueDecision
} from "magda-typescript-common/src/opa/AuthDecision.js";

const JWT_SECRET = "test-jwt-secret";
const USER_ID = "00000000-0000-4000-8000-000000000001";

type UpstreamRequest = {
    url: string;
    headers: IncomingMessage["headers"];
};

const SWITCHING_PROTOCOLS =
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n";

/**
 * Upstream that accepts WebSocket upgrades (echoing every byte back). Special paths:
 * - `/reject`: answered with a plain 401
 * - `/slow`: answered with 101 after 300ms
 * - `/never`: never answered
 * - `/reset`: upgraded, then the connection is reset
 */
function createUpstream() {
    const requests: UpstreamRequest[] = [];
    const sockets = new Set<net.Socket>();
    // upstream sockets whose client went away before the 101 was sent
    const abandoned: string[] = [];
    const server = http.createServer((req, res) => {
        res.writeHead(200);
        res.end("plain http");
    });
    server.on("upgrade", (req, socket: net.Socket) => {
        requests.push({ url: req.url, headers: req.headers });
        socket.on("error", () => socket.destroy());
        // like a real WebSocket server: close when the peer closes its side
        socket.on("end", () => socket.destroy());
        if (req.url.includes("/reject")) {
            socket.end(
                "HTTP/1.1 401 Unauthorized\r\nContent-Length: 6\r\nConnection: close\r\n\r\nnope!!"
            );
            return;
        }
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
        if (req.url.includes("/never")) {
            return;
        }
        const accept = () => {
            if (socket.destroyed) {
                abandoned.push(req.url);
                return;
            }
            socket.write(SWITCHING_PROTOCOLS);
            if (req.url.includes("/reset")) {
                setTimeout(() => socket.resetAndDestroy(), 50);
                return;
            }
            socket.pipe(socket);
        };
        if (req.url.includes("/slow")) {
            setTimeout(accept, 300);
        } else {
            accept();
        }
    });
    return { server, requests, sockets, abandoned };
}

function listen(server: http.Server): Promise<number> {
    return new Promise((resolve) =>
        server.listen(0, "127.0.0.1", () =>
            resolve((server.address() as AddressInfo).port)
        )
    );
}

/** Send a raw upgrade request; resolves with the status code and the live socket. */
function upgrade(
    port: number,
    path: string,
    headers: Record<string, string> = {}
): Promise<{ status: number; head: string; socket: net.Socket }> {
    return new Promise((resolve, reject) => {
        const socket = net.connect(port, "127.0.0.1");
        const lines = [
            `GET ${path} HTTP/1.1`,
            "Host: magda.example.com",
            "Connection: Upgrade",
            "Upgrade: websocket",
            "Sec-WebSocket-Version: 13",
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
            ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`)
        ];
        let buf = "";
        const onData = (data: Buffer) => {
            buf += data.toString("latin1");
            const end = buf.indexOf("\r\n\r\n");
            if (end === -1) return;
            socket.off("data", onData);
            resolve({
                status: Number(buf.split(" ")[1]),
                head: buf.slice(0, end),
                socket
            });
        };
        socket.on("data", onData);
        socket.on("error", reject);
        socket.write(lines.join("\r\n") + "\r\n\r\n");
    });
}

/** Collect everything the client receives until the socket closes. */
function readUntilClose(socket: net.Socket): Promise<string> {
    return new Promise((resolve) => {
        let data = "";
        socket.on("data", (d) => (data += d.toString("latin1")));
        socket.once("close", () => resolve(data));
    });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readOnce(socket: net.Socket): Promise<string> {
    return new Promise((resolve) =>
        socket.once("data", (d) => resolve(d.toString()))
    );
}

describe("WebSocket upgrade proxying", () => {
    let upstream: ReturnType<typeof createUpstream>;
    let upstreamPort: number;
    let gateway: http.Server;
    let gatewayPort: number;
    let upgradeHandler: WebSocketUpgradeHandler;
    let allowAccess: boolean;

    beforeEach(async () => {
        upstream = createUpstream();
        upstreamPort = await listen(upstream.server);
        allowAccess = true;

        const authenticator = sinon.createStubInstance(Authenticator);
        // pretend the session middleware recognised a logged-in user
        authenticator.applyToRoute = (router: express.Router) => {
            router.use((req: any, _res, next) => {
                if (req.headers["x-test-user"]) {
                    req.user = { id: USER_ID, session: "s1" };
                }
                next();
            });
        };
        const authClient = sinon.createStubInstance(AuthDecisionQueryClient);
        authClient.getAuthDecision = () =>
            Promise.resolve(
                allowAccess
                    ? UnconditionalTrueDecision
                    : UnconditionalFalseDecision
            );

        const app = express();
        app.use(
            "/api/v0",
            createGenericProxyRouter({
                authenticator,
                jwtSecret: JWT_SECRET,
                authClient,
                tenantMode: setupTenantMode({ enableMultiTenants: false }),
                websocketHandshakeTimeout: 0.5,
                routes: {
                    "agent/runtime": {
                        to: `http://127.0.0.1:${upstreamPort}/runtime`,
                        auth: true,
                        websocket: true
                    },
                    secured: {
                        to: `http://127.0.0.1:${upstreamPort}/secured`,
                        accessControl: true,
                        websocket: true
                    },
                    plain: {
                        to: `http://127.0.0.1:${upstreamPort}/plain`
                    },
                    unreachable: {
                        to: "http://127.0.0.1:1/nowhere",
                        websocket: true
                    }
                }
            })
        );
        gateway = http.createServer(app);
        upgradeHandler = new WebSocketUpgradeHandler(app);
        gateway.on("upgrade", upgradeHandler.handleUpgrade);
        gatewayPort = await listen(gateway);
    });

    afterEach(async () => {
        upgradeHandler.closeAll();
        upstream.sockets.forEach((s) => s.destroy());
        await new Promise((r) => gateway.close(r));
        await new Promise((r) => upstream.server.close(r));
    });

    it("should forward an upgrade on a `websocket: true` route and relay data both ways", async () => {
        const { status, socket } = await upgrade(
            gatewayPort,
            "/api/v0/agent/runtime/api/remote.mux?x=1"
        );
        expect(status).to.equal(101);
        expect(upstream.requests[0].url).to.equal(
            "/runtime/api/remote.mux?x=1"
        );
        socket.write("ping-123");
        expect(await readOnce(socket)).to.equal("ping-123");
        socket.destroy();
    });

    it("should attach X-Magda-Session for the authenticated user and drop credential headers", async () => {
        const { status, socket } = await upgrade(
            gatewayPort,
            "/api/v0/agent/runtime/api/remote.mux",
            {
                "X-Test-User": "1",
                Cookie: "connect.sid=abc",
                Authorization: "Bearer secret",
                Origin: "https://magda.example.com"
            }
        );
        expect(status).to.equal(101);
        const headers = upstream.requests[0].headers;
        const session = jwt.verify(
            headers["x-magda-session"] as string,
            JWT_SECRET
        ) as any;
        expect(session.userId).to.equal(USER_ID);
        expect(headers.cookie).to.be.undefined;
        expect(headers.authorization).to.be.undefined;
        expect(headers.origin).to.equal("https://magda.example.com");
        expect(headers.upgrade).to.equal("websocket");
        expect(headers["x-magda-tenant-id"]).to.equal("0");
        socket.destroy();
    });

    it("should not attach X-Magda-Session for an anonymous handshake", async () => {
        const { status, socket } = await upgrade(
            gatewayPort,
            "/api/v0/agent/runtime/api/remote.mux"
        );
        expect(status).to.equal(101);
        expect(upstream.requests[0].headers["x-magda-session"]).to.be.undefined;
        socket.destroy();
    });

    it("should answer 400 for an upgrade on a route without `websocket: true`", async () => {
        const { status, socket } = await upgrade(
            gatewayPort,
            "/api/v0/plain/x"
        );
        expect(status).to.equal(400);
        expect(upstream.requests).to.have.length(0);
        socket.destroy();
    });

    it("should answer 404 for an upgrade that matches no route", async () => {
        const { status, socket } = await upgrade(gatewayPort, "/api/v0/nope");
        expect(status).to.equal(404);
        socket.destroy();
    });

    it("should apply access control before the upgrade is forwarded", async () => {
        allowAccess = false;
        const { status, socket } = await upgrade(
            gatewayPort,
            "/api/v0/secured/x"
        );
        expect(status).to.equal(403);
        expect(upstream.requests).to.have.length(0);
        socket.destroy();
    });

    it("should relay an upstream non-101 response to the client", async () => {
        const { status, socket } = await upgrade(
            gatewayPort,
            "/api/v0/agent/runtime/reject"
        );
        expect(status).to.equal(401);
        socket.destroy();
    });

    it("should answer 502 when the upstream is unreachable", async () => {
        const { status, socket } = await upgrade(
            gatewayPort,
            "/api/v0/unreachable/x"
        );
        expect(status).to.equal(502);
        socket.destroy();
    });

    it("should close both sides of upgraded connections on closeAll()", async () => {
        const { socket } = await upgrade(
            gatewayPort,
            "/api/v0/agent/runtime/api/remote.mux"
        );
        expect(upgradeHandler.activeSocketCount).to.equal(1);
        const clientClosed = new Promise((r) => socket.once("close", r));
        upgradeHandler.closeAll();
        await clientClosed;
        // the upstream side of the pair is torn down as well
        await new Promise((r) => setTimeout(r, 50));
        expect(upstream.sockets.size).to.equal(0);
        expect(upgradeHandler.activeSocketCount).to.equal(0);

        const after = await upgrade(
            gatewayPort,
            "/api/v0/agent/runtime/api/remote.mux"
        );
        expect(after.status).to.equal(503);
        after.socket.destroy();
    });

    it("should abort the upstream handshake when the client disconnects before the upgrade", async () => {
        const socket = net.connect(gatewayPort, "127.0.0.1");
        await new Promise((r) => socket.once("connect", r));
        socket.write(
            [
                "GET /api/v0/agent/runtime/slow HTTP/1.1",
                "Host: magda.example.com",
                "Connection: Upgrade",
                "Upgrade: websocket",
                "Sec-WebSocket-Version: 13",
                "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ=="
            ].join("\r\n") + "\r\n\r\n"
        );
        // leave while the upstream is still "resuming"
        await sleep(100);
        expect(upstream.requests).to.have.length(1);
        socket.destroy();
        // the upstream would answer at 300ms
        await sleep(400);
        expect(upstream.abandoned).to.deep.equal(["/runtime/slow"]);
        expect(upstream.sockets.size).to.equal(0);
        expect(upgradeHandler.activeSocketCount).to.equal(0);
    });

    it("should answer 504 when the upstream doesn't answer the handshake in time", async () => {
        const started = Date.now();
        const { status, socket } = await upgrade(
            gatewayPort,
            "/api/v0/agent/runtime/never"
        );
        expect(status).to.equal(504);
        expect(Date.now() - started).to.be.within(400, 2000);
        await new Promise((r) => socket.once("close", r));
        // the pending upstream connection is closed as well
        await sleep(50);
        expect(upstream.sockets.size).to.equal(0);
    });

    it("should not apply the handshake timeout to an upgraded connection", async () => {
        const { status, socket } = await upgrade(
            gatewayPort,
            "/api/v0/agent/runtime/api/remote.mux"
        );
        expect(status).to.equal(101);
        // longer than the 0.5s handshake timeout
        await sleep(800);
        socket.write("still-here");
        expect(await readOnce(socket)).to.equal("still-here");
        socket.destroy();
    });

    it("should close an upgraded connection without writing HTTP when the upstream fails", async () => {
        const { status, socket } = await upgrade(
            gatewayPort,
            "/api/v0/agent/runtime/reset"
        );
        expect(status).to.equal(101);
        const afterUpgrade = await readUntilClose(socket);
        expect(afterUpgrade).to.not.include("HTTP/1.1");
    });

    it("should deliver a complete rejection response even when the client keeps sending data", async () => {
        const socket = net.connect(gatewayPort, "127.0.0.1");
        await new Promise((r) => socket.once("connect", r));
        const received = readUntilClose(socket);
        socket.write(
            [
                "GET /api/v0/plain/x HTTP/1.1",
                "Host: magda.example.com",
                "Connection: Upgrade",
                "Upgrade: websocket",
                "Sec-WebSocket-Version: 13",
                "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ=="
            ].join("\r\n") + "\r\n\r\n"
        );
        // unread bytes that would make an abrupt close reset the connection
        socket.write(Buffer.alloc(64 * 1024, 1));
        socket.end();
        const response = await received;
        expect(response).to.match(/^HTTP\/1\.1 400 /);
        expect(response).to.include(
            "WebSocket upgrade is not supported by this route."
        );
    });

    it("should keep serving ordinary HTTP requests", async () => {
        const body = await new Promise<string>((resolve, reject) => {
            http.get(
                `http://127.0.0.1:${gatewayPort}/api/v0/plain/x`,
                (res) => {
                    let data = "";
                    res.on("data", (d) => (data += d));
                    res.on("end", () => resolve(data));
                }
            ).on("error", reject);
        });
        expect(body).to.equal("plain http");
    });
});

describe("closeSocketGracefully", () => {
    /** A socket whose writes reach the "network" 50ms after they are queued. */
    function createSlowSocket() {
        const delivered: string[] = [];
        const socket: Duplex = new Duplex({
            read() {
                // no incoming data
            },
            write(chunk, _encoding, callback) {
                setTimeout(() => {
                    if (!socket.destroyed) {
                        delivered.push(chunk.toString());
                    }
                    callback();
                }, 50);
            },
            final(callback) {
                callback();
                // the peer closes its side once it has read the response
                socket.push(null);
            }
        });
        return { socket, delivered };
    }

    it("should flush queued data before the socket closes", async () => {
        const { socket, delivered } = createSlowSocket();
        const closed = new Promise((r) => socket.once("close", r));
        closeSocketGracefully(
            socket,
            "HTTP/1.1 503 Service Unavailable\r\n\r\n"
        );
        await closed;
        expect(delivered).to.deep.equal([
            "HTTP/1.1 503 Service Unavailable\r\n\r\n"
        ]);
    });

    it("would lose the data with an immediate destroy (the previous behaviour)", async () => {
        const { socket, delivered } = createSlowSocket();
        socket.end("HTTP/1.1 503 Service Unavailable\r\n\r\n");
        socket.destroy();
        await sleep(100);
        expect(delivered).to.deep.equal([]);
    });

    it("should destroy a socket that can't be written to", () => {
        const { socket } = createSlowSocket();
        socket.destroy();
        closeSocketGracefully(socket, "x");
        expect(socket.destroyed).to.equal(true);
    });
});

describe("WebSocket Origin validation", () => {
    let upstream: ReturnType<typeof createUpstream>;
    let upstreamPort: number;
    const gateways: {
        server: http.Server;
        handler: WebSocketUpgradeHandler;
    }[] = [];
    let authDecisionCalls: number;
    let allowAccess: boolean;

    beforeEach(async () => {
        upstream = createUpstream();
        upstreamPort = await listen(upstream.server);
        authDecisionCalls = 0;
        allowAccess = true;
    });

    afterEach(async () => {
        for (const { server, handler } of gateways.splice(0)) {
            handler.closeAll();
            await new Promise((r) => server.close(r));
        }
        upstream.sockets.forEach((s) => s.destroy());
        await new Promise((r) => upstream.server.close(r));
    });

    /**
     * A gateway with the real route / middleware / proxy stack and an `agent` route:
     * `{ to: upstream, auth: true, accessControl: true, websocket: true, ...routeOptions }`.
     */
    async function startGateway(
        externalUrl: string | undefined,
        routeOptions: Record<string, any> = {}
    ): Promise<number> {
        const authenticator = sinon.createStubInstance(Authenticator);
        authenticator.applyToRoute = (router: express.Router) => {
            router.use((req: any, _res, next) => {
                if (req.headers["x-test-user"]) {
                    req.user = { id: USER_ID, session: "s1" };
                }
                next();
            });
        };
        const authClient = sinon.createStubInstance(AuthDecisionQueryClient);
        authClient.getAuthDecision = () => {
            authDecisionCalls++;
            return Promise.resolve(
                allowAccess
                    ? UnconditionalTrueDecision
                    : UnconditionalFalseDecision
            );
        };
        const app = express();
        app.use(
            "/api/v0",
            createGenericProxyRouter({
                authenticator,
                jwtSecret: JWT_SECRET,
                authClient,
                externalUrl,
                tenantMode: setupTenantMode({ enableMultiTenants: false }),
                routes: {
                    agent: {
                        to: `http://127.0.0.1:${upstreamPort}/agent`,
                        auth: true,
                        accessControl: true,
                        websocket: true,
                        ...routeOptions
                    },
                    plain: {
                        to: `http://127.0.0.1:${upstreamPort}/plain`,
                        methods: ["all"]
                    }
                }
            })
        );
        const server = http.createServer(app);
        const handler = new WebSocketUpgradeHandler(app);
        server.on("upgrade", handler.handleUpgrade);
        gateways.push({ server, handler });
        return listen(server);
    }

    async function handshake(
        port: number,
        origin: string | undefined,
        extraHeaders: Record<string, string> = {}
    ) {
        const headers = { ...extraHeaders };
        if (origin !== undefined) {
            headers.Origin = origin;
        }
        const { status, socket } = await upgrade(
            port,
            "/api/v0/agent/ws",
            headers
        );
        socket.destroy();
        return status;
    }

    it("should allow the origin derived from `externalUrl` (ignoring its path)", async () => {
        const port = await startGateway("https://magda.example.com/some/path");
        expect(await handshake(port, "https://magda.example.com")).to.equal(
            101
        );
        expect(upstream.requests).to.have.length(1);
        expect(upstream.requests[0].headers.origin).to.equal(
            "https://magda.example.com"
        );
    });

    it("should reject a non-matching origin with 403 before reaching the upstream or OPA", async () => {
        const port = await startGateway("https://magda.example.com/some/path");
        expect(await handshake(port, "https://evil.example.com")).to.equal(403);
        expect(upstream.requests).to.have.length(0);
        expect(authDecisionCalls).to.equal(0);
    });

    it("should reject a handshake without Origin when validation is enabled", async () => {
        const port = await startGateway("https://magda.example.com");
        expect(await handshake(port, undefined)).to.equal(403);
        expect(upstream.requests).to.have.length(0);
    });

    it("should not treat a different scheme, port or a suffix-matching host as the same origin", async () => {
        const port = await startGateway("https://magda.example.com");
        for (const origin of [
            "http://magda.example.com",
            "https://magda.example.com:8443",
            "https://magda.example.com.evil.com",
            "https://evilmagda.example.com",
            "https://sub.magda.example.com"
        ]) {
            expect(await handshake(port, origin), origin).to.equal(403);
        }
        expect(upstream.requests).to.have.length(0);
    });

    it("should normalise default ports and hostname case", async () => {
        const port = await startGateway("HTTPS://Magda.Example.com:443/");
        expect(await handshake(port, "https://magda.example.com")).to.equal(
            101
        );
        expect(await handshake(port, "https://MAGDA.example.com:443")).to.equal(
            101
        );
    });

    it("should reject malformed Origin headers", async () => {
        const port = await startGateway("https://magda.example.com");
        for (const origin of [
            "null",
            "magda.example.com",
            "https://magda.example.com/",
            "https://magda.example.com/path",
            "https://magda.example.com?x=1",
            "https://user@magda.example.com",
            "https://magda.example.com, https://magda.example.com",
            "https://magda.example.com https://evil.example.com",
            "ftp://magda.example.com",
            "*"
        ]) {
            expect(await handshake(port, origin), origin).to.equal(403);
        }
        expect(upstream.requests).to.have.length(0);
    });

    it("should only allow an explicit list, which replaces the `externalUrl` default", async () => {
        const port = await startGateway("https://magda.example.com", {
            websocketAllowedOrigins: [
                "https://tenant-a.example.com",
                "HTTP://LocalHost:8080/"
            ]
        });
        expect(await handshake(port, "https://tenant-a.example.com")).to.equal(
            101
        );
        expect(await handshake(port, "http://localhost:8080")).to.equal(101);
        expect(await handshake(port, "http://localhost:8081")).to.equal(403);
        expect(await handshake(port, "https://localhost:8080")).to.equal(403);
        expect(await handshake(port, "https://magda.example.com")).to.equal(
            403
        );
        expect(upstream.requests).to.have.length(2);
    });

    it("should disable Origin validation for an explicit empty list", async () => {
        const port = await startGateway("https://magda.example.com", {
            websocketAllowedOrigins: []
        });
        expect(await handshake(port, "https://evil.example.com")).to.equal(101);
        expect(await handshake(port, undefined)).to.equal(101);
    });

    it("should skip Origin validation when neither an allowlist nor `externalUrl` is configured", async () => {
        const port = await startGateway(undefined);
        expect(await handshake(port, "https://evil.example.com")).to.equal(101);
        expect(await handshake(port, undefined)).to.equal(101);
    });

    it("should still authenticate and apply access control to allowed origins", async () => {
        const port = await startGateway("https://magda.example.com");
        expect(
            await handshake(port, "https://magda.example.com", {
                "X-Test-User": "1"
            })
        ).to.equal(101);
        const session = jwt.verify(
            upstream.requests[0].headers["x-magda-session"] as string,
            JWT_SECRET
        ) as any;
        expect(session.userId).to.equal(USER_ID);
        expect(authDecisionCalls).to.equal(1);

        allowAccess = false;
        expect(await handshake(port, "https://magda.example.com")).to.equal(
            403
        );
        expect(authDecisionCalls).to.equal(2);
        expect(upstream.requests).to.have.length(1);
    });

    it("should not apply Origin validation to ordinary HTTP requests", async () => {
        const port = await startGateway("https://magda.example.com");
        const status = await new Promise<number>((resolve, reject) => {
            http.get(
                {
                    host: "127.0.0.1",
                    port,
                    path: "/api/v0/agent/x",
                    headers: { Origin: "https://evil.example.com" }
                },
                (res) => {
                    res.resume();
                    resolve(res.statusCode);
                }
            ).on("error", reject);
        });
        expect(status).to.equal(200);
    });

    it("should keep rejecting upgrades on non-WebSocket routes with 400", async () => {
        const port = await startGateway("https://magda.example.com");
        const { status, socket } = await upgrade(port, "/api/v0/plain/ws", {
            Origin: "https://magda.example.com"
        });
        socket.destroy();
        expect(status).to.equal(400);
        expect(upstream.requests).to.have.length(0);
    });

    describe("invalid configuration", () => {
        function createRouter(
            externalUrl: string | undefined,
            routeOptions: Record<string, any>
        ) {
            return createGenericProxyRouter({
                authenticator: sinon.createStubInstance(Authenticator),
                jwtSecret: JWT_SECRET,
                authClient: sinon.createStubInstance(AuthDecisionQueryClient),
                externalUrl,
                tenantMode: setupTenantMode({ enableMultiTenants: false }),
                routes: {
                    agent: { to: "http://upstream", ...routeOptions }
                }
            });
        }

        for (const origin of [
            "magda.example.com",
            "ftp://magda.example.com",
            "https://magda.example.com/path",
            "https://magda.example.com?x=1",
            "https://magda.example.com#f",
            "https://user:pass@magda.example.com",
            "https://*.example.com",
            "*",
            "null",
            " https://magda.example.com",
            "",
            42
        ]) {
            it(`should reject allowed origin ${JSON.stringify(origin)}`, () => {
                expect(() =>
                    createRouter("https://magda.example.com", {
                        websocket: true,
                        websocketAllowedOrigins: [origin]
                    })
                ).to.throw(/websocketAllowedOrigins/);
            });
        }

        it("should reject a non-array `websocketAllowedOrigins`", () => {
            expect(() =>
                createRouter("https://magda.example.com", {
                    websocket: true,
                    websocketAllowedOrigins: "https://magda.example.com"
                })
            ).to.throw(/must be an array/);
        });

        it("should validate an explicit list even when `websocket` is off", () => {
            expect(() =>
                createRouter("https://magda.example.com", {
                    websocketAllowedOrigins: ["not-an-origin"]
                })
            ).to.throw(/websocketAllowedOrigins/);
        });

        it("should reject an invalid `externalUrl` that a WebSocket route relies on", () => {
            expect(() =>
                createRouter("not a url", { websocket: true })
            ).to.throw(/externalUrl/);
            expect(() =>
                createRouter("ftp://magda.example.com", { websocket: true })
            ).to.throw(/externalUrl/);
            // routes without WebSocket support don't depend on it
            expect(() => createRouter("not a url", {})).to.not.throw();
        });
    });
});
