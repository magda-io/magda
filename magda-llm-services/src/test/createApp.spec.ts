import assert from "node:assert/strict";
import http, { RequestListener } from "node:http";
import { AddressInfo } from "node:net";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import createApp, {
    LlmServicesConfig,
    parseAllowedModels
} from "../createApp.js";

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

function config(overrides: Partial<LlmServicesConfig> = {}): LlmServicesConfig {
    return {
        jwtSecret,
        authApiUrl: "http://authorization-api.test/v0",
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
    // The current `agentWorkspace/access` decision for the test user.
    let workspaceAccess: boolean | "unavailable";
    let decisionUrls: string[];

    beforeEach(() => {
        workspaceAccess = true;
        decisionUrls = [];
        global.fetch = async (input) => {
            const url = String(input);
            if (url.includes("/opa/decision/")) {
                decisionUrls.push(url);
                if (workspaceAccess === "unavailable") {
                    return new Response("unavailable", { status: 500 });
                }
                return Response.json({
                    hasResidualRules: false,
                    result: workspaceAccess
                });
            }
            // An ordinary (non-admin) user; access comes only from the policy.
            return Response.json({
                id: userId,
                roles: [{ id: "00000000-0000-0002-0000-000000000000" }]
            });
        };
    });

    afterEach(() => {
        global.fetch = originalFetch;
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

    it("requires agentWorkspace/access instead of the administrator role", async () => {
        const running = await listen(createApp(config()));
        try {
            workspaceAccess = false;
            const denied = await originalFetch(
                new URL("/v0/v1/models", running.url),
                { headers: { "X-Magda-Session": session } }
            );
            assert.equal(denied.status, 403);
            assert.match(await denied.text(), /Agent Workspace access/);

            workspaceAccess = true;
            const granted = await originalFetch(
                new URL("/v0/v1/models", running.url),
                { headers: { "X-Magda-Session": session } }
            );
            assert.equal(granted.status, 200);
            assert.deepEqual(decisionUrls, [
                "http://authorization-api.test/v0/opa/decision/agentWorkspace/access?unknowns=",
                "http://authorization-api.test/v0/opa/decision/agentWorkspace/access?unknowns="
            ]);
        } finally {
            await close(running.server);
        }
    });

    it("fails closed when the policy engine is unavailable", async () => {
        const running = await listen(createApp(config()));
        const originalError = console.error;
        console.error = () => undefined;
        try {
            workspaceAccess = "unavailable";
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
