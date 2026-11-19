import {} from "mocha";
import { expect } from "chai";
import sinon from "sinon";
import express from "express";
import http, { IncomingMessage, ServerResponse } from "http";
import { AddressInfo, Socket } from "net";
import Authenticator from "../Authenticator.js";
import setupTenantMode from "../setupTenantMode.js";
import createGenericProxyRouter from "../createGenericProxyRouter.js";
import createEarlyRejectionMiddleware from "../createEarlyRejectionMiddleware.js";
import createRequestTimeoutMiddleware from "../createRequestTimeoutMiddleware.js";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";

const LINGER_SECONDS = 0.4;
const MAX_DISCARD_BYTES = 1024 * 1024;

function listen(server: http.Server): Promise<number> {
    return new Promise((resolve) =>
        server.listen(0, "127.0.0.1", () =>
            resolve((server.address() as AddressInfo).port)
        )
    );
}

type Upstream = (req: IncomingMessage, res: ServerResponse) => void;

/** An upstream that rejects without reading the body, then keeps reading it (as Agent Manager does). */
const rejectAndLinger = (status: number): Upstream => (req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: `rejected with ${status}` }));
    req.resume();
};

/** The status and (de-chunked) body of a raw HTTP/1.1 response. */
function parseResponse(
    raw: Buffer
): {
    status?: number;
    body?: string;
    connection?: string;
} {
    const text = raw.toString("latin1");
    const headerEnd = text.indexOf("\r\n\r\n");
    if (headerEnd < 0) return {};
    const head = text.slice(0, headerEnd);
    let body = text.slice(headerEnd + 4);
    if (/^transfer-encoding:\s*chunked/im.test(head)) {
        let decoded = "";
        for (;;) {
            const lineEnd = body.indexOf("\r\n");
            const size = parseInt(body.slice(0, lineEnd), 16);
            if (!(size > 0)) break;
            decoded += body.slice(lineEnd + 2, lineEnd + 2 + size);
            body = body.slice(lineEnd + 2 + size + 2);
        }
        body = decoded;
    }
    const connection = /^connection:\s*(.*)$/im.exec(head)?.[1];
    return { status: Number(head.split(" ")[1]), body, connection };
}

interface Result {
    status?: number;
    connection?: string;
    body?: string;
    error?: string;
    sentBytes: number;
    // ms from the first write until the connection closed
    closedAfterMs?: number;
}

describe("early rejection of a request whose body hasn't arrived", function () {
    this.timeout(15_000);

    let upstream: http.Server;
    let gateway: http.Server;
    let gatewayPort: number;
    let upstreamBytes: number;
    let handler: Upstream;
    let handled: string[];
    let upstreamRequests: string[];

    beforeEach(async () => {
        upstreamBytes = 0;
        handled = [];
        upstreamRequests = [];
        upstream = http.createServer((req, res) => {
            upstreamRequests.push(`${req.method} ${req.url}`);
            req.on("data", (chunk: Buffer) => (upstreamBytes += chunk.length));
            handler(req, res);
        });
        const upstreamPort = await listen(upstream);

        const authenticator = sinon.createStubInstance(Authenticator);
        authenticator.applyToRoute = (): void => undefined;
        const app = express();
        app.use(
            createEarlyRejectionMiddleware({
                lingerSeconds: LINGER_SECONDS,
                maxDiscardBytes: MAX_DISCARD_BYTES
            })
        );
        // Shorter than the SSE test stream, which it must not limit.
        app.use(createRequestTimeoutMiddleware(1));
        // The Gateway itself rejecting, e.g. a failed access check.
        // Records the requests that reach a handler.
        app.all("/api/v0/record", (req, res) => {
            handled.push(req.method);
            req.resume();
            req.on("end", () => res.end("recorded"));
        });
        app.post("/api/v0/own-reject", (_req, res) => {
            res.status(401).json({ message: "rejected by the Gateway" });
        });
        app.use(
            "/api/v0",
            createGenericProxyRouter({
                authenticator,
                jwtSecret: "secret",
                authClient: sinon.createStubInstance(AuthDecisionQueryClient),
                tenantMode: setupTenantMode({ enableMultiTenants: false }),
                routes: {
                    up: {
                        to: `http://127.0.0.1:${upstreamPort}/up`,
                        methods: ["all"]
                    }
                }
            })
        );
        gateway = http.createServer(app);
        gateway.requestTimeout = 0;
        gatewayPort = await listen(gateway);
    });

    afterEach(async () => {
        for (const server of [gateway, upstream]) {
            server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
        }
    });

    /**
     * POST `chunks` × `chunkBytes` over a raw socket with `Connection: close`
     * (as nginx sends), writing the whole body regardless of any response,
     * as a client that only reads the response once it has sent everything
     * does; `stallAfter` stops writing after that many chunks.
     */
    function post(
        path: string,
        chunks: number,
        chunkBytes: number,
        { chunked = false, stallAfter = Infinity } = {}
    ): Promise<Result> {
        return new Promise((resolve) => {
            const result: Result = { sentBytes: 0 };
            let started = 0;
            let received = Buffer.alloc(0);
            const socket = new Socket();
            socket.on("data", (chunk) => {
                received = Buffer.concat([received, chunk]);
            });
            socket.on("error", (error: NodeJS.ErrnoException) => {
                result.error = result.error || error.code || error.message;
            });
            socket.on("close", () => {
                result.closedAfterMs = Date.now() - started;
                Object.assign(result, parseResponse(received));
                resolve(result);
            });
            socket.connect(gatewayPort, "127.0.0.1", () => {
                socket.write(
                    `POST ${path} HTTP/1.1\r\nHost: magda.test\r\n` +
                        "Connection: close\r\n" +
                        "Content-Type: application/octet-stream\r\n" +
                        (chunked
                            ? "Transfer-Encoding: chunked\r\n\r\n"
                            : `Content-Length: ${chunks * chunkBytes}\r\n\r\n`)
                );
                let written = 0;
                const writeNext = () => {
                    if (socket.destroyed) return;
                    if (written === Math.min(chunks, stallAfter)) {
                        if (written === chunks && chunked) {
                            socket.write("0\r\n\r\n");
                        }
                        return;
                    }
                    if (!started) started = Date.now();
                    written += 1;
                    const data = Buffer.alloc(chunkBytes, 1);
                    const frame = chunked
                        ? Buffer.concat([
                              Buffer.from(`${chunkBytes.toString(16)}\r\n`),
                              data,
                              Buffer.from("\r\n")
                          ])
                        : data;
                    socket.write(frame, (error) => {
                        if (error) return;
                        result.sentBytes += chunkBytes;
                        setImmediate(writeNext);
                    });
                };
                writeNext();
            });
        });
    }

    /**
     * Write `parts` on one raw connection, waiting 30 ms between them, or,
     * with `afterResponse`, until a response has started before the last
     * part. Resolves with the raw responses.
     */
    function rawExchange(
        parts: string[],
        { afterResponse = false } = {}
    ): Promise<string> {
        return new Promise((resolve) => {
            const socket = new Socket();
            let data = "";
            socket.on("data", (chunk) => (data += chunk));
            socket.on("error", () => undefined);
            socket.on("close", () => resolve(data));
            socket.connect(gatewayPort, "127.0.0.1", async () => {
                for (const [index, part] of parts.entries()) {
                    if (afterResponse && index === parts.length - 1) {
                        while (!data.includes("HTTP/1.1")) {
                            await new Promise((r) => setTimeout(r, 10));
                        }
                    }
                    if (!socket.destroyed) socket.write(part);
                    await new Promise((r) => setTimeout(r, 30));
                }
            });
        });
    }

    const statusLines = (raw: string) => raw.match(/HTTP\/1\.1 \d{3}/g) || [];

    for (const [label, path] of [
        ["the Gateway's own rejection", "/api/v0/own-reject"],
        ["an upstream rejection", "/api/v0/up/upload"]
    ]) {
        // Only requests parsed after the rejection is known are guaranteed
        // not to run: as with any server, one pipelined before it may.
        it(`never runs a request pipelined after ${label}`, async () => {
            handler = rejectAndLinger(413);
            const raw = await rawExchange(
                [
                    `POST ${path} HTTP/1.1\r\nHost: x\r\nContent-Length: 2000\r\n\r\n` +
                        "x".repeat(1000),
                    "x".repeat(1000) +
                        "POST /api/v0/record HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\n\r\n" +
                        "POST /api/v0/up/record HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\n\r\n"
                ],
                { afterResponse: true }
            );
            expect(statusLines(raw)).to.deep.equal([
                path.includes("own") ? "HTTP/1.1 401" : "HTTP/1.1 413"
            ]);
            expect(handled).to.deep.equal([]);
            expect(
                upstreamRequests.filter((r) => r.endsWith("/record"))
            ).to.deep.equal([]);
        });
    }

    it("leaves keep-alive requests alone when nothing is rejected, and serves a new connection after a rejection", async () => {
        const raw = await rawExchange([
            "POST /api/v0/record HTTP/1.1\r\nHost: x\r\nContent-Length: 2\r\n\r\nab",
            "POST /api/v0/record HTTP/1.1\r\nHost: x\r\nContent-Length: 2\r\n\r\nab" +
                "GET /api/v0/record HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"
        ]);
        expect(statusLines(raw)).to.deep.equal([
            "HTTP/1.1 200",
            "HTTP/1.1 200",
            "HTTP/1.1 200"
        ]);
        expect(handled).to.deep.equal(["POST", "POST", "GET"]);
        const rejected = await post("/api/v0/own-reject", 4, 1024);
        expect(rejected.status).to.equal(401);
        const after = await rawExchange([
            "GET /api/v0/record HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"
        ]);
        expect(statusLines(after)).to.deep.equal(["HTTP/1.1 200"]);
    });

    it("closes a connection whose rejection response stalls within twice the linger time", async () => {
        handler = (req, res) => {
            res.writeHead(413, { "content-type": "text/plain" });
            res.write("rejected, then stalled");
            req.resume();
        };
        const result = await post("/api/v0/up/upload", 4096, 16 * 1024);
        expect(result.status).to.equal(413);
        // The body limit (1 MiB) or linger time ends the drain, then the
        // stalled response gets one more linger period.
        expect(result.closedAfterMs).to.be.within(
            LINGER_SECONDS * 1000 * 0.8,
            LINGER_SECONDS * 1000 * 2 + 500
        );
    });

    for (const chunked of [false, true]) {
        const shape = chunked ? "chunked" : "Content-Length";

        it(`forwards an upstream 413 for a ${shape} upload and stops sending the body upstream`, async () => {
            handler = rejectAndLinger(413);
            const result = await post("/api/v0/up/upload", 32, 16 * 1024, {
                chunked
            });
            expect(result.status).to.equal(413);
            expect(JSON.parse(result.body!)).to.deep.equal({
                message: "rejected with 413"
            });
            // Never reused after an incomplete request.
            expect(result.connection).to.equal("close");
            // The client could send its whole body: the Gateway discarded the
            // rest instead of sending it upstream.
            expect(result.error).to.equal(undefined);
            expect(result.sentBytes).to.equal(32 * 16 * 1024);
            expect(upstreamBytes).to.be.below(32 * 16 * 1024);
        });

        it(`delivers the Gateway's own 401 for a ${shape} upload and closes once the body is discarded`, async () => {
            const result = await post("/api/v0/own-reject", 32, 16 * 1024, {
                chunked
            });
            expect(result.status).to.equal(401);
            expect(JSON.parse(result.body!)).to.deep.equal({
                message: "rejected by the Gateway"
            });
            expect(result.error).to.equal(undefined);
            expect(result.sentBytes).to.equal(32 * 16 * 1024);
        });
    }

    it("stops discarding at the byte limit and closes the connection", async () => {
        handler = rejectAndLinger(403);
        const result = await post("/api/v0/up/upload", 512, 16 * 1024);
        expect(result.status).to.equal(403);
        expect(JSON.parse(result.body!)).to.deep.equal({
            message: "rejected with 403"
        });
        // It read up to the limit, then closed without reading the rest.
        expect(result.sentBytes).to.be.at.least(MAX_DISCARD_BYTES);
        expect(result.sentBytes).to.be.below(512 * 16 * 1024);
        expect(result.closedAfterMs).to.be.below(LINGER_SECONDS * 1000 * 3);
    });

    it("stops lingering after the time limit when the client stalls", async () => {
        const result = await post("/api/v0/own-reject", 32, 16 * 1024, {
            stallAfter: 2
        });
        expect(result.status).to.equal(401);
        // The linger limit, not the 1-second request timeout.
        expect(result.closedAfterMs).to.be.within(
            LINGER_SECONDS * 1000 * 0.8,
            LINGER_SECONDS * 1000 * 2
        );
    });

    it("keeps the upstream's response even when the upstream closes its connection", async () => {
        handler = (_req, res) => {
            // No lingering: Node closes the connection after the response.
            res.writeHead(413, {
                "content-type": "application/json",
                connection: "close"
            });
            res.end(JSON.stringify({ message: "rejected with 413" }));
        };
        const result = await post("/api/v0/up/upload", 64, 16 * 1024);
        // The rejection is kept whenever it reached the Gateway; it is never
        // replaced by a generic error once it has started.
        if (result.status === 413) {
            expect(JSON.parse(result.body!)).to.deep.equal({
                message: "rejected with 413"
            });
        } else {
            expect(result.status).to.equal(502);
        }
    });

    it("ends a truncated upstream response as a failed connection, not a complete one", async () => {
        handler = (_req, res) => {
            res.writeHead(200, { "content-type": "text/plain" });
            res.write("partial");
            setTimeout(() => res.socket!.destroy(), 50);
        };
        const outcome = await new Promise<string>((resolve) => {
            http.get(
                { host: "127.0.0.1", port: gatewayPort, path: "/api/v0/up/x" },
                (res) => {
                    let body = "";
                    res.on("data", (chunk) => (body += chunk));
                    res.on("end", () => resolve(`complete: ${body}`));
                    res.on("aborted", () => resolve("aborted"));
                    res.on("error", () => resolve("aborted"));
                }
            ).on("error", () => resolve("aborted"));
        });
        expect(outcome).to.equal("aborted");
    });

    it("doesn't touch a request whose upload succeeds", async () => {
        handler = (req, res) => {
            req.on("end", () => res.end("ok"));
        };
        const result = await post("/api/v0/up/upload", 32, 16 * 1024);
        expect(result.status).to.equal(200);
        expect(result.body).to.equal("ok");
        expect(upstreamBytes).to.equal(32 * 16 * 1024);
    });

    it("cleans up when the client disconnects during the drain", async () => {
        const closed = new Promise<void>((resolve) => {
            const req = http.request({
                host: "127.0.0.1",
                port: gatewayPort,
                method: "POST",
                path: "/api/v0/own-reject",
                headers: { "content-length": String(1024 * 1024) }
            });
            req.on("error", () => undefined);
            req.on("response", (res) => {
                res.resume();
                req.destroy();
                resolve();
            });
            req.write(Buffer.alloc(16 * 1024, 1));
        });
        await closed;
        // Past both linger timers: they must not act on the closed socket.
        await new Promise((resolve) =>
            setTimeout(resolve, LINGER_SECONDS * 1000 * 2 + 200)
        );
        const open = await new Promise<number>((resolve, reject) =>
            gateway.getConnections((error, count) =>
                error ? reject(error) : resolve(count)
            )
        );
        expect(open).to.equal(0);
    });

    it("leaves a long SSE response to a POST untouched", async () => {
        // As a chatbot: read the JSON question, then stream events for longer
        // than both the linger time and the request timeout.
        handler = (req, res) => {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", () => {
                res.writeHead(200, {
                    "content-type": "text/event-stream",
                    "cache-control": "no-cache, no-transform"
                });
                let sent = 0;
                const timer = setInterval(() => {
                    sent += 1;
                    res.write(`event: msg\ndata: ${sent}\n\n`);
                    if (sent === 15) {
                        clearInterval(timer);
                        res.end();
                    }
                }, 100);
                res.on("close", () => clearInterval(timer));
            });
        };
        const events = await new Promise<string[]>((resolve, reject) => {
            const req = http.request(
                {
                    host: "127.0.0.1",
                    port: gatewayPort,
                    method: "POST",
                    path: "/api/v0/up/v2",
                    headers: { "content-type": "application/json" }
                },
                (res) => {
                    let text = "";
                    res.on("data", (chunk) => (text += chunk));
                    res.on("end", () =>
                        resolve(text.match(/data: \d+/g) || [])
                    );
                }
            );
            req.on("error", reject);
            req.end(JSON.stringify({ question: "q", chat_history: [] }));
        });
        expect(events).to.have.length(15);
    });
});
