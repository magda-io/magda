import { expect } from "chai";
import { MagdaClient } from "../client.js";
import { MgdApiError } from "../errors.js";
import { encodeKey, storageObject } from "../endpoints.js";
import { startMockServer } from "./mockServer.js";

describe("endpoints", () => {
    it("encodes key segments but keeps separators", () => {
        expect(encodeKey("a b/c#d/e")).to.equal("a%20b/c%23d/e");
        expect(storageObject("magda-datasets", "ds1/dist1/f.csv")).to.equal(
            "/v0/storage/magda-datasets/ds1/dist1/f.csv"
        );
    });
});

describe("MagdaClient", () => {
    it("attaches API key headers and user agent", async () => {
        const server = await startMockServer([
            { method: "GET", path: "/v0/auth/users/whoami", body: { id: "u1" } }
        ]);
        try {
            const client = new MagdaClient({
                baseUrl: server.url,
                apiKeyId: "kid",
                apiKey: "kv"
            });
            const user = await client.json<any>("GET", "/v0/auth/users/whoami");
            expect(user.id).to.equal("u1");
            const req = server.requests[0];
            expect(req.headers["x-magda-api-key-id"]).to.equal("kid");
            expect(req.headers["x-magda-api-key"]).to.equal("kv");
            expect(req.headers["user-agent"]).to.match(/^mgd\//);
            expect(req.headers["x-magda-client-id"]).to.equal(undefined);
        } finally {
            await server.close();
        }
    });

    it("adds client metadata headers on mutating requests", async () => {
        const server = await startMockServer([
            { method: "POST", path: "/v0/registry/records", body: {} }
        ]);
        try {
            const client = new MagdaClient({ baseUrl: server.url });
            await client.json("POST", "/v0/registry/records", {
                body: JSON.stringify({ id: "x" }),
                headers: { "content-type": "application/json" }
            });
            const req = server.requests[0];
            expect(req.headers["x-magda-client-id"]).to.equal("mgd");
            expect(req.headers["x-magda-client-invocation-id"]).to.match(
                /^[0-9a-f-]{36}$/
            );
        } finally {
            await server.close();
        }
    });

    it("throws MgdApiError with server message on non-2xx", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/registry/records/nope",
                status: 404,
                body: { message: "no record" }
            }
        ]);
        try {
            const client = new MagdaClient({ baseUrl: server.url });
            let err: unknown;
            try {
                await client.json("GET", "/v0/registry/records/nope");
            } catch (e) {
                err = e;
            }
            expect(err).to.be.instanceOf(MgdApiError);
            expect((err as MgdApiError).status).to.equal(404);
            expect((err as MgdApiError).message).to.equal("no record");
        } finally {
            await server.close();
        }
    });

    it("retries GETs on 5xx up to 3 attempts", async () => {
        let calls = 0;
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/flaky",
                handler: (_req, res) => {
                    calls++;
                    if (calls < 3) {
                        res.writeHead(500).end("boom");
                    } else {
                        res.writeHead(200, {
                            "content-type": "application/json"
                        }).end(JSON.stringify({ ok: true }));
                    }
                }
            }
        ]);
        try {
            const client = new MagdaClient({ baseUrl: server.url });
            // retryDelayMs keeps the test fast
            const out = await client.json<any>("GET", "/v0/flaky", {
                retryDelayMs: 1
            });
            expect(out.ok).to.equal(true);
            expect(calls).to.equal(3);
        } finally {
            await server.close();
        }
    });

    it("never retries mutating requests", async () => {
        let calls = 0;
        const server = await startMockServer([
            {
                method: "POST",
                path: "/v0/thing",
                handler: (_req, res) => {
                    calls++;
                    res.writeHead(500).end("boom");
                }
            }
        ]);
        try {
            const client = new MagdaClient({ baseUrl: server.url });
            let err: unknown;
            try {
                await client.json("POST", "/v0/thing", { retryDelayMs: 1 });
            } catch (e) {
                err = e;
            }
            expect(err).to.be.instanceOf(MgdApiError);
            expect(calls).to.equal(1);
        } finally {
            await server.close();
        }
    });
});
