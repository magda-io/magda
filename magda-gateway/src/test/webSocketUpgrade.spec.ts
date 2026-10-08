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
import WebSocketUpgradeHandler from "../WebSocketUpgradeHandler.js";
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

/**
 * Upstream that accepts WebSocket upgrades (echoing every byte back) unless the
 * request path contains `/reject`, which is answered with a plain 401.
 */
function createUpstream() {
    const requests: UpstreamRequest[] = [];
    const sockets = new Set<net.Socket>();
    const server = http.createServer((req, res) => {
        res.writeHead(200);
        res.end("plain http");
    });
    server.on("upgrade", (req, socket: net.Socket) => {
        requests.push({ url: req.url, headers: req.headers });
        if (req.url.includes("/reject")) {
            socket.end(
                "HTTP/1.1 401 Unauthorized\r\nContent-Length: 6\r\nConnection: close\r\n\r\nnope!!"
            );
            return;
        }
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
        socket.write(
            "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n"
        );
        socket.pipe(socket);
    });
    return { server, requests, sockets };
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
