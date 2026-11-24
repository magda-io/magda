import assert from "node:assert/strict";
import http, { RequestListener } from "node:http";
import { AddressInfo } from "node:net";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import createApp, {
    LlmServicesConfig,
    parseAllowedModels
} from "../createApp.js";
import {
    ADMIN_ROLE,
    FakeAuthApi,
    FakeAuthUser,
    startFakeAuthApi
} from "./fakeAuthApi.js";

const jwtSecret = "llm-services-test-secret";
const userId = "00000000-0000-4000-8000-000000000001";
const session = jwt.sign({ userId }, jwtSecret, { algorithm: "HS256" });

async function listen(handler: RequestListener) {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    return {
        server,
        url: new URL(`http://127.0.0.1:${port}`)
    };
}

async function close(server: http.Server) {
    server.close();
    await once(server, "close");
}

let authApi: FakeAuthApi;

function config(overrides: Partial<LlmServicesConfig> = {}): LlmServicesConfig {
    return {
        jwtSecret,
        authApiUrl: authApi.url,
        liteLlmUrl: new URL("http://127.0.0.1:1"),
        liteLlmKey: "master-key",
        allowedModels: new Set(["gpt-5.6-sol"]),
        ...overrides
    };
}

describe("LLM Services", () => {
    it("parses the resolved JSON-array model allowlist", () => {
        assert.deepEqual(
            [...parseAllowedModels('["magda-agent-default","another-model"]')],
            ["magda-agent-default", "another-model"]
        );
        assert.deepEqual(
            [...parseAllowedModels('[" model-with-padding "]')],
            ["model-with-padding"]
        );
    });

    it("rejects missing, malformed, empty, invalid, and duplicate allowlists", () => {
        for (const value of [
            undefined,
            "not-json",
            "{}",
            "[]",
            '[""]',
            '["   "]',
            '["model",1]',
            '["model","model"]',
            '["model"," model "]'
        ]) {
            assert.throws(() => parseAllowedModels(value));
        }
    });

    const originalFetch = global.fetch;

    beforeEach(async () => {
        authApi = await startFakeAuthApi();
        // An administrator by default: model access without a profile
        // (AUTH-10). Profile-based access is tested in invocation.spec.ts.
        authApi.users.set(userId, { roles: [ADMIN_ROLE] });
    });

    afterEach(async () => {
        await authApi.close();
    });

    it("serves health endpoints without authentication", async () => {
        const running = await listen(createApp(config()));
        try {
            const response = await originalFetch(
                new URL("/v0/status/ready", running.url)
            );
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), { status: "ok" });
        } finally {
            await close(running.server);
        }
    });

    it("reports not ready while its database is unavailable", async () => {
        let healthy = false;
        const pool = {
            query: async () => {
                if (!healthy) throw new Error("connection refused");
                return { rows: [{ "?column?": 1 }] };
            }
        } as any;
        const running = await listen(createApp(config({ pool })));
        const originalError = console.error;
        console.error = () => undefined;
        try {
            const ready = new URL("/v0/status/ready", running.url);
            assert.equal((await originalFetch(ready)).status, 503);
            healthy = true;
            assert.equal((await originalFetch(ready)).status, 200);
            // liveness doesn't depend on the database
            healthy = false;
            const live = await originalFetch(
                new URL("/v0/status/live", running.url)
            );
            assert.equal(live.status, 200);
        } finally {
            console.error = originalError;
            await close(running.server);
        }
    });

    it("requires an authenticated user", async () => {
        const running = await listen(createApp(config()));
        try {
            const response = await originalFetch(
                new URL("/v0/v1/models", running.url)
            );
            assert.equal(response.status, 401);
            assert.match(await response.text(), /authentication required/i);
        } finally {
            await close(running.server);
        }
    });

    it("asks for an llm/access/invoke partial decision, not agentWorkspace/access", async () => {
        const running = await listen(createApp(config()));
        try {
            // an ordinary user without any invoke grant
            authApi.users.set(userId, {
                roles: [],
                decision: { hasResidualRules: false, result: false }
            });
            const models = await originalFetch(
                new URL("/v0/v1/models", running.url),
                { headers: { "X-Magda-Session": session } }
            );
            assert.equal(models.status, 200);
            assert.equal(
                models.headers.get("cache-control"),
                "private, no-store"
            );
            assert.deepEqual(await models.json(), { object: "list", data: [] });
            assert.deepEqual(authApi.calls.decisions, [
                {
                    userId,
                    path: "/v0/opa/decision/llm/access/invoke",
                    body: { unknowns: ["input.object.llmAccessProfile"] }
                }
            ]);
            const denied = await originalFetch(
                new URL("/v0/v1/responses", running.url),
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "X-Magda-Session": session
                    },
                    body: JSON.stringify({ model: "gpt-5.6-sol" })
                }
            );
            assert.equal(denied.status, 403);
            assert.equal(
                (await denied.json()).error.code,
                "llm_no_eligible_profile"
            );
        } finally {
            await close(running.server);
        }
    });

    it("fails closed when the policy engine is unavailable", async () => {
        const running = await listen(createApp(config()));
        const originalError = console.error;
        console.error = () => undefined;
        try {
            authApi.users.set(userId, { roles: [], decision: "unavailable" });
            const response = await originalFetch(
                new URL("/v0/v1/models", running.url),
                { headers: { "X-Magda-Session": session } }
            );
            assert.equal(response.status, 503);
        } finally {
            console.error = originalError;
            await close(running.server);
        }
    });

    it("reports an Authorization API outage as 503, not an invalid session", async () => {
        const running = await listen(createApp(config()));
        const originalError = console.error;
        console.error = () => undefined;
        authApi.users.set(userId, { whoamiStatus: 503 });
        try {
            const response = await originalFetch(
                new URL("/v0/v1/models", running.url),
                { headers: { "X-Magda-Session": session } }
            );
            assert.equal(response.status, 503);
            assert.match(await response.text(), /Unable to verify/);
        } finally {
            console.error = originalError;
            await close(running.server);
        }
    });

    it("rejects a session whoami cannot verify or that names another user", async () => {
        const running = await listen(createApp(config()));
        try {
            const otherUser = "00000000-0000-4000-8000-000000000002";
            const otherSession = jwt.sign({ userId: otherUser }, jwtSecret, {
                algorithm: "HS256"
            });
            for (const [token, user] of [
                // whoami answers 401
                [session, { whoamiStatus: 401 }],
                // a session signed with another secret
                [jwt.sign({ userId }, "another-secret"), { roles: [] }],
                // the session is valid, but whoami doesn't know the user
                [otherSession, undefined]
            ] as Array<[string, FakeAuthUser | undefined]>) {
                authApi.users.clear();
                if (user) authApi.users.set(userId, user);
                const response = await originalFetch(
                    new URL("/v0/v1/models", running.url),
                    { headers: { "X-Magda-Session": token } }
                );
                assert.equal(response.status, 401);
                assert.match(await response.text(), /Invalid Magda session/);
            }
        } finally {
            await close(running.server);
        }
    });

    it("lists only deployment-allowed models", async () => {
        const running = await listen(createApp(config()));
        try {
            const response = await originalFetch(
                new URL("/v0/v1/models", running.url),
                { headers: { "X-Magda-Session": session } }
            );
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), {
                object: "list",
                data: [
                    {
                        id: "gpt-5.6-sol",
                        object: "model",
                        owned_by: "magda"
                    }
                ]
            });
        } finally {
            await close(running.server);
        }
    });

    it("rejects models outside the allowlist", async () => {
        const running = await listen(createApp(config()));
        try {
            const response = await originalFetch(
                new URL("/v0/v1/responses", running.url),
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "X-Magda-Session": session
                    },
                    body: JSON.stringify({ model: "not-allowed" })
                }
            );
            assert.equal(response.status, 403);
            assert.match(await response.text(), /model is not available/i);
        } finally {
            await close(running.server);
        }
    });

    for (const path of ["/v1/chat/completions", "/v1/responses"]) {
        it(`proxies ${path} with the provider credential`, async () => {
            let received:
                | { path?: string; authorization?: string; body?: string }
                | undefined;
            const upstream = await listen((req, res) => {
                const chunks: Buffer[] = [];
                req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
                req.on("end", () => {
                    received = {
                        path: req.url,
                        authorization: req.headers.authorization,
                        body: Buffer.concat(chunks).toString("utf8")
                    };
                    res.writeHead(200, { "content-type": "application/json" });
                    res.end(JSON.stringify({ ok: true }));
                });
            });
            const running = await listen(
                createApp(config({ liteLlmUrl: upstream.url }))
            );
            try {
                const response = await originalFetch(
                    new URL(`/v0${path}`, running.url),
                    {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            "X-Magda-Session": session
                        },
                        body: JSON.stringify({ model: "gpt-5.6-sol" })
                    }
                );
                assert.equal(response.status, 200);
                assert.deepEqual(await response.json(), { ok: true });
                assert.equal(received?.path, path);
                assert.equal(received?.authorization, "Bearer master-key");
                assert.deepEqual(JSON.parse(received?.body || "{}"), {
                    model: "gpt-5.6-sol"
                });
            } finally {
                await close(running.server);
                await close(upstream.server);
            }
        });
    }
});
