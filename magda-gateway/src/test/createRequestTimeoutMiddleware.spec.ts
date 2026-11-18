import {} from "mocha";
import { expect } from "chai";
import express from "express";
import http from "node:http";
import { AddressInfo } from "node:net";
import createRequestTimeoutMiddleware, {
    requestTimeoutFor
} from "../createRequestTimeoutMiddleware.js";

describe("createRequestTimeoutMiddleware", () => {
    describe("requestTimeoutFor", () => {
        const perPath = {
            "/api/v0/agent": 3600,
            "/api/v0/agent/runtime/slow": 0,
            "/api/v0/storage/": 900
        };

        it("uses the default outside every configured path", () => {
            expect(
                requestTimeoutFor("/api/v0/registry/records", 300, perPath)
            ).to.equal(300);
        });

        it("matches a configured path and anything below it", () => {
            expect(requestTimeoutFor("/api/v0/agent", 300, perPath)).to.equal(
                3600
            );
            expect(
                requestTimeoutFor(
                    "/api/v0/agent/runtime/api/session/uploadFileBinary",
                    300,
                    perPath
                )
            ).to.equal(3600);
            expect(
                requestTimeoutFor("/api/v0/storage/bucket/a", 300, perPath)
            ).to.equal(900);
        });

        it("matches whole path segments only", () => {
            expect(
                requestTimeoutFor("/api/v0/agentfoo", 300, perPath)
            ).to.equal(300);
        });

        it("prefers the longest matching path", () => {
            expect(
                requestTimeoutFor("/api/v0/agent/runtime/slow/x", 300, perPath)
            ).to.equal(0);
        });
    });

    describe("on a server", () => {
        let server: http.Server;
        let port: number;

        beforeEach(async () => {
            const app = express();
            app.use(createRequestTimeoutMiddleware(0.2, { "/upload": 2 }));
            app.post("*", (req, res) => {
                let bytes = 0;
                req.on("data", (chunk: Buffer) => (bytes += chunk.length));
                req.on("end", () => res.json({ bytes }));
            });
            server = app.listen(0, "127.0.0.1");
            // As in index.ts: the middleware owns the request deadline.
            server.requestTimeout = 0;
            await new Promise((resolve) => server.once("listening", resolve));
            port = (server.address() as AddressInfo).port;
        });

        afterEach(async () => {
            server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
        });

        /** POST 4 chunks, `gapMs` apart. */
        function slowPost(path: string, gapMs: number) {
            return new Promise<{ status: number; body: string }>(
                (resolve, reject) => {
                    const req = http.request({
                        host: "127.0.0.1",
                        port,
                        method: "POST",
                        path,
                        headers: { "content-length": "4" }
                    });
                    req.on("response", (res) => {
                        let body = "";
                        res.on("data", (chunk) => (body += chunk));
                        res.on("end", () =>
                            resolve({ status: res.statusCode || 0, body })
                        );
                    });
                    req.on("error", reject);
                    let sent = 0;
                    const next = () => {
                        if (req.destroyed) return;
                        sent += 1;
                        if (sent === 4) req.end("x");
                        else {
                            req.write("x");
                            setTimeout(next, gapMs);
                        }
                    };
                    next();
                }
            );
        }

        it("answers 408 when a request isn't received within the default", async () => {
            const response = await slowPost("/api/other", 150);
            expect(response.status).to.equal(408);
        });

        it("lets a slow request finish within its path's longer timeout", async () => {
            const response = await slowPost("/upload/file", 150);
            expect(response.status).to.equal(200);
            expect(JSON.parse(response.body)).to.deep.equal({ bytes: 4 });
        });

        it("doesn't limit a request that arrives in time", async () => {
            const response = await slowPost("/api/other", 10);
            expect(response.status).to.equal(200);
        });
    });
});
