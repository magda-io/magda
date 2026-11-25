import assert from "node:assert/strict";
import http, { RequestListener } from "node:http";
import { AddressInfo } from "node:net";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import createApp, { LlmServicesConfig } from "../createApp.js";
import { ADMIN_ROLE } from "./fakeAuthApi.js";
import RequestMeter from "../metering/RequestMeter.js";
import { prepareRequestBody } from "../metering/requestBody.js";
import {
    DEFAULT_USAGE_ESTIMATE,
    estimateTokens,
    parseUsageEstimateConfig,
    parseUsageObserverLimits,
    UsageSettlement,
    UsageSink
} from "../metering/settlement.js";

const jwtSecret = "llm-services-test-secret";
const userId = "00000000-0000-4000-8000-000000000001";
const session = jwt.sign({ userId }, jwtSecret, { algorithm: "HS256" });
const MODEL = "magda-agent-default";

class RecordingSink implements UsageSink {
    settlements: UsageSettlement[] = [];
    async settle(settlement: UsageSettlement) {
        this.settlements.push(settlement);
    }
    async waitFor(count: number, timeoutMs = 2000) {
        const started = Date.now();
        while (this.settlements.length < count) {
            if (Date.now() - started > timeoutMs) {
                throw new Error(
                    `Expected ${count} settlements, got ${this.settlements.length}`
                );
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
        // give a duplicate settlement a chance to show up
        await new Promise((resolve) => setTimeout(resolve, 50));
        return this.settlements;
    }
}

async function listen(handler: RequestListener) {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    return { server, url: new URL(`http://127.0.0.1:${port}`) };
}

async function close(server: http.Server) {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
}

const sse = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const DONE = "data: [DONE]\n\n";

const responsesStream = [
    sse({ type: "response.created", response: { status: "in_progress" } }),
    sse({ type: "response.output_text.delta", delta: "Hello 🌏" }),
    sse({
        type: "response.completed",
        response: {
            status: "completed",
            usage: {
                input_tokens: 4312,
                output_tokens: 18,
                total_tokens: 4330,
                input_tokens_details: { cached_tokens: 4223 },
                output_tokens_details: { reasoning_tokens: 11 }
            }
        }
    }),
    DONE
].join("");

describe("usage metering in the proxy (#3838 METER-1 to METER-6)", function (this: Mocha.Suite) {
    this.timeout(10000);
    const originalFetch = global.fetch;

    beforeEach(() => {
        // whoami: an administrator, so admission needs no profile or database
        // (AUTH-10); usage is still settled (USE-9)
        global.fetch = async () =>
            Response.json({ id: userId, roles: [ADMIN_ROLE] });
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    async function withApp(
        upstreamHandler: RequestListener,
        run: (appUrl: URL, sink: RecordingSink) => Promise<void>,
        overrides: Partial<LlmServicesConfig> = {}
    ) {
        const upstream = await listen(upstreamHandler);
        const sink = new RecordingSink();
        const app = await listen(
            createApp({
                jwtSecret,
                authApiUrl: "http://authorization-api.test/v0",
                liteLlmUrl: upstream.url,
                liteLlmKey: "master-key",
                allowedModels: new Set([MODEL]),
                usageSink: sink,
                ...overrides
            })
        );
        try {
            await run(app.url, sink);
        } finally {
            await close(app.server);
            await close(upstream.server);
        }
    }

    function post(appUrl: URL, path: string, body: string) {
        return originalFetch(new URL(`/v0${path}`, appUrl), {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "X-Magda-Session": session
            },
            body
        });
    }

    function readBody(req: http.IncomingMessage): Promise<Buffer> {
        return new Promise((resolve) => {
            const chunks: Buffer[] = [];
            req.on("data", (c) => chunks.push(Buffer.from(c)));
            req.on("end", () => resolve(Buffer.concat(chunks)));
        });
    }

    it("forwards a fragmented Responses stream byte for byte and settles its final usage once", async () => {
        const bytes = Buffer.from(responsesStream);
        let forwardedBody = "";
        await withApp(
            async (req, res) => {
                forwardedBody = (await readBody(req)).toString("utf8");
                res.writeHead(200, { "content-type": "text/event-stream" });
                // split at awkward places, including inside a UTF-8 character
                for (let i = 0; i < bytes.length; i += 7) {
                    res.write(bytes.subarray(i, i + 7));
                    await new Promise((resolve) => setImmediate(resolve));
                }
                res.end();
            },
            async (appUrl, sink) => {
                const body = JSON.stringify({
                    model: MODEL,
                    stream: true,
                    input: "hi"
                });
                const response = await post(appUrl, "/v1/responses", body);
                assert.equal(response.status, 200);
                const received = Buffer.from(await response.arrayBuffer());
                assert.ok(received.equals(bytes), "stream bytes unchanged");
                // Responses never gets Chat stream_options (METER-2)
                assert.equal(forwardedBody, body);

                const [settlement, ...rest] = await sink.waitFor(1);
                assert.equal(rest.length, 0);
                assert.equal(settlement.kind, "measured");
                if (settlement.kind !== "measured") return;
                // reasoning and cached tokens are subsets, never added again
                assert.equal(settlement.inputTokens, 4312);
                assert.equal(settlement.outputTokens, 18);
                assert.equal(settlement.userId, userId);
                assert.equal(settlement.modelAlias, MODEL);
                assert.equal(settlement.endpoint, "/v1/responses");
                assert.ok(settlement.requestStartedAt instanceof Date);
            }
        );
    });

    it("asks for usage on a streaming Chat request that turned it off, and meters the usage chunk", async () => {
        let forwarded: any;
        await withApp(
            async (req, res) => {
                forwarded = JSON.parse((await readBody(req)).toString("utf8"));
                res.writeHead(200, { "content-type": "text/event-stream" });
                res.write(
                    sse({
                        object: "chat.completion.chunk",
                        choices: [
                            { delta: { content: "hi" }, finish_reason: "stop" }
                        ]
                    })
                );
                res.write(
                    sse({
                        object: "chat.completion.chunk",
                        choices: [],
                        usage: {
                            prompt_tokens: 20,
                            completion_tokens: 10,
                            total_tokens: 30
                        }
                    })
                );
                res.end(DONE);
            },
            async (appUrl, sink) => {
                const response = await post(
                    appUrl,
                    "/v1/chat/completions",
                    JSON.stringify({
                        model: MODEL,
                        stream: true,
                        stream_options: { include_usage: false, other: 1 },
                        messages: [{ role: "user", content: "hi" }]
                    })
                );
                await response.arrayBuffer();
                assert.deepEqual(forwarded.stream_options, {
                    include_usage: true,
                    other: 1
                });
                assert.deepEqual(forwarded.messages, [
                    { role: "user", content: "hi" }
                ]);
                const [settlement] = await sink.waitFor(1);
                assert.equal(settlement.kind, "measured");
                if (settlement.kind !== "measured") return;
                assert.equal(settlement.inputTokens, 20);
                assert.equal(settlement.outputTokens, 10);
            }
        );
    });

    it("meters a non-streaming Chat response", async () => {
        await withApp(
            async (req, res) => {
                await readBody(req);
                res.writeHead(200, { "content-type": "application/json" });
                res.end(
                    JSON.stringify({
                        object: "chat.completion",
                        choices: [],
                        usage: {
                            prompt_tokens: 5,
                            completion_tokens: 7,
                            total_tokens: 12
                        }
                    })
                );
            },
            async (appUrl, sink) => {
                const response = await post(
                    appUrl,
                    "/v1/chat/completions",
                    JSON.stringify({ model: MODEL, messages: [] })
                );
                await response.arrayBuffer();
                const [settlement] = await sink.waitFor(1);
                assert.equal(settlement.kind, "measured");
                if (settlement.kind !== "measured") return;
                assert.equal(
                    settlement.inputTokens + settlement.outputTokens,
                    12
                );
            }
        );
    });

    it("charges nothing when the upstream refuses the request (4xx)", async () => {
        await withApp(
            async (req, res) => {
                await readBody(req);
                res.writeHead(400, { "content-type": "application/json" });
                res.end(JSON.stringify({ error: { message: "bad" } }));
            },
            async (appUrl, sink) => {
                const response = await post(
                    appUrl,
                    "/v1/responses",
                    JSON.stringify({ model: MODEL })
                );
                assert.equal(response.status, 400);
                await response.arrayBuffer();
                await new Promise((resolve) => setTimeout(resolve, 100));
                assert.equal(sink.settlements.length, 0);
            }
        );
    });

    for (const status of [500, 502, 503, 504]) {
        it(`charges nothing for an upstream server error (${status})`, async () => {
            await withApp(
                async (req, res) => {
                    await readBody(req);
                    res.writeHead(status, {
                        "content-type": "application/json"
                    });
                    res.end(JSON.stringify({ error: { message: "failed" } }));
                },
                async (appUrl, sink) => {
                    const response = await post(
                        appUrl,
                        "/v1/responses",
                        JSON.stringify({ model: MODEL })
                    );
                    assert.equal(response.status, status);
                    await response.arrayBuffer();
                    await new Promise((resolve) => setTimeout(resolve, 100));
                    assert.equal(sink.settlements.length, 0);
                }
            );
        });
    }

    it("estimates a 2xx response it can't read usage from (METER-4)", async () => {
        const body = JSON.stringify({ model: MODEL, input: "x".repeat(100) });
        await withApp(
            async (req, res) => {
                await readBody(req);
                res.writeHead(200, { "content-type": "text/plain" });
                res.end("a model response in an unexpected format");
            },
            async (appUrl, sink) => {
                await (await post(appUrl, "/v1/responses", body)).arrayBuffer();
                const [settlement] = await sink.waitFor(1);
                assert.equal(settlement.kind, "estimated");
                if (settlement.kind !== "estimated") return;
                assert.equal(settlement.reason, "unobservable");
                assert.equal(
                    settlement.estimatedTokens,
                    Math.ceil(Buffer.byteLength(body) / 4) + 4096
                );
            }
        );
    });

    it("estimates a 2xx JSON response without valid usage", async () => {
        for (const responseBody of [
            JSON.stringify({ object: "chat.completion", choices: [] }),
            JSON.stringify({
                object: "chat.completion",
                usage: { prompt_tokens: -1, completion_tokens: 2 }
            }),
            "{not json"
        ]) {
            await withApp(
                async (req, res) => {
                    await readBody(req);
                    res.writeHead(200, { "content-type": "application/json" });
                    res.end(responseBody);
                },
                async (appUrl, sink) => {
                    await (
                        await post(
                            appUrl,
                            "/v1/chat/completions",
                            JSON.stringify({ model: MODEL, messages: [] })
                        )
                    ).arrayBuffer();
                    const [settlement] = await sink.waitFor(1);
                    assert.equal(settlement.kind, "estimated", responseBody);
                    if (settlement.kind !== "estimated") return;
                    assert.equal(settlement.reason, "missing_final_usage");
                }
            );
        }
    });

    it("estimates once when the upstream drops the connection after the request was sent", async () => {
        await withApp(
            async (req) => {
                await readBody(req);
                req.socket.destroy();
            },
            async (appUrl, sink) => {
                const originalError = console.error;
                console.error = () => undefined;
                try {
                    const response = await post(
                        appUrl,
                        "/v1/responses",
                        JSON.stringify({ model: MODEL })
                    );
                    assert.equal(response.status, 502);
                    await response.arrayBuffer();
                    const settlements = await sink.waitFor(1);
                    assert.equal(settlements.length, 1);
                    const [settlement] = settlements;
                    assert.equal(settlement.kind, "estimated");
                    if (settlement.kind !== "estimated") return;
                    assert.equal(settlement.reason, "interrupted");
                } finally {
                    console.error = originalError;
                }
            }
        );
    });

    it("estimates a stream that ends without a terminal event", async () => {
        await withApp(
            async (req, res) => {
                await readBody(req);
                res.writeHead(200, { "content-type": "text/event-stream" });
                res.end(
                    sse({ type: "response.output_text.delta", delta: "x" })
                );
            },
            async (appUrl, sink) => {
                await (
                    await post(
                        appUrl,
                        "/v1/responses",
                        JSON.stringify({ model: MODEL, stream: true })
                    )
                ).arrayBuffer();
                const [settlement] = await sink.waitFor(1);
                assert.equal(settlement.kind, "estimated");
                if (settlement.kind !== "estimated") return;
                assert.equal(settlement.reason, "missing_final_usage");
                assert.equal(settlement.quality.terminalSeen, false);
            }
        );
    });

    it("estimates a completed stream whose terminal event has no usage (seen live on the pinned LiteLLM)", async () => {
        await withApp(
            async (req, res) => {
                await readBody(req);
                res.writeHead(200, { "content-type": "text/event-stream" });
                res.write(
                    sse({ type: "response.output_text.delta", delta: "OK" })
                );
                res.write(
                    sse({
                        type: "response.completed",
                        response: { status: "completed" }
                    })
                );
                res.end(DONE);
            },
            async (appUrl, sink) => {
                await (
                    await post(
                        appUrl,
                        "/v1/responses",
                        JSON.stringify({ model: MODEL, stream: true })
                    )
                ).arrayBuffer();
                const [settlement] = await sink.waitFor(1);
                assert.equal(settlement.kind, "estimated");
                if (settlement.kind !== "estimated") return;
                assert.equal(settlement.reason, "missing_final_usage");
                assert.equal(settlement.quality.terminalSeen, true);
            }
        );
    });

    it("estimates once when the client disconnects mid-stream, and stops the upstream", async () => {
        let upstreamClosed = false;
        await withApp(
            async (req, res) => {
                await readBody(req);
                res.writeHead(200, { "content-type": "text/event-stream" });
                res.write(sse({ type: "response.created", response: {} }));
                res.on("close", () => {
                    upstreamClosed = true;
                });
                // never ends on its own
            },
            async (appUrl, sink) => {
                await new Promise<void>((resolve, reject) => {
                    const req = http.request(
                        new URL("/v0/v1/responses", appUrl),
                        {
                            method: "POST",
                            headers: {
                                "content-type": "application/json",
                                "X-Magda-Session": session
                            }
                        },
                        (res) => {
                            res.once("data", () => {
                                req.destroy();
                                resolve();
                            });
                        }
                    );
                    req.on("error", () => undefined);
                    req.end(JSON.stringify({ model: MODEL, stream: true }));
                    setTimeout(() => reject(new Error("no data")), 2000);
                });
                const settlements = await sink.waitFor(1);
                assert.equal(settlements.length, 1);
                const [settlement] = settlements;
                assert.equal(settlement.kind, "estimated");
                if (settlement.kind !== "estimated") return;
                assert.equal(settlement.reason, "interrupted");
                const started = Date.now();
                while (!upstreamClosed && Date.now() - started < 2000) {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }
                assert.equal(upstreamClosed, true);
            }
        );
    });

    for (const stage of ["mid-stream", "mid-JSON"] as const) {
        it(`ends the client connection as failed when the upstream drops it ${stage}, and estimates once`, async () => {
            await withApp(
                async (req, res) => {
                    await readBody(req);
                    if (stage === "mid-stream") {
                        res.writeHead(200, {
                            "content-type": "text/event-stream"
                        });
                        res.write(
                            sse({ type: "response.created", response: {} })
                        );
                    } else {
                        res.writeHead(200, {
                            "content-type": "application/json",
                            "content-length": "1000"
                        });
                        res.write('{"object":"chat.completion",');
                    }
                    setTimeout(() => res.socket?.destroy(), 50);
                },
                async (appUrl, sink) => {
                    const response = await post(
                        appUrl,
                        "/v1/responses",
                        JSON.stringify({ model: MODEL, stream: true })
                    );
                    assert.equal(response.status, 200);
                    // The truncated response must end as a failed connection,
                    // not hang or look complete (as in the Gateway, #3930).
                    const outcome = await Promise.race([
                        response.arrayBuffer().then(
                            () => "completed",
                            () => "failed"
                        ),
                        new Promise((resolve) =>
                            setTimeout(() => resolve("hung"), 3000)
                        )
                    ]);
                    assert.equal(outcome, "failed");
                    const settlements = await sink.waitFor(1);
                    assert.equal(settlements.length, 1);
                    assert.equal(settlements[0].kind, "estimated");
                }
            );
        });
    }

    it("charges nothing when the upstream can't be reached", async () => {
        const sink = new RecordingSink();
        const app = await listen(
            createApp({
                jwtSecret,
                authApiUrl: "http://authorization-api.test/v0",
                liteLlmUrl: new URL("http://127.0.0.1:1"),
                liteLlmKey: "master-key",
                allowedModels: new Set([MODEL]),
                usageSink: sink
            })
        );
        const originalError = console.error;
        console.error = () => undefined;
        try {
            const response = await post(
                app.url,
                "/v1/responses",
                JSON.stringify({ model: MODEL })
            );
            assert.equal(response.status, 502);
            await new Promise((resolve) => setTimeout(resolve, 100));
            assert.equal(sink.settlements.length, 0);
        } finally {
            console.error = originalError;
            await close(app.server);
        }
    });

    it("still forwards the response, and estimates it, when the usage observer can't be created", async () => {
        const bytes = Buffer.from(responsesStream);
        await withApp(
            async (req, res) => {
                await readBody(req);
                res.writeHead(200, { "content-type": "text/event-stream" });
                res.end(bytes);
            },
            async (appUrl, sink) => {
                const originalError = console.error;
                console.error = () => undefined;
                try {
                    const response = await post(
                        appUrl,
                        "/v1/responses",
                        JSON.stringify({ model: MODEL, stream: true })
                    );
                    assert.equal(response.status, 200);
                    const received = Buffer.from(await response.arrayBuffer());
                    assert.ok(received.equals(bytes));
                    const [settlement] = await sink.waitFor(1);
                    assert.equal(settlement.kind, "estimated");
                    if (settlement.kind !== "estimated") return;
                    assert.equal(settlement.reason, "observer_error");
                } finally {
                    console.error = originalError;
                }
            },
            // invalid limits bypassing startup validation
            { observerLimits: { maxEventBytes: 0 } }
        );
    });

    it("rejects a non-object JSON body before forwarding", async () => {
        await withApp(
            (_req, _res) => assert.fail("must not be forwarded"),
            async (appUrl, sink) => {
                for (const body of ["null", "[]", "1", '"x"']) {
                    const response = await post(appUrl, "/v1/responses", body);
                    assert.equal(response.status, 400, body);
                }
                assert.equal(sink.settlements.length, 0);
            }
        );
    });
});

describe("metering helpers", () => {
    it("estimates request bytes over bytesPerToken plus the output allowance (METER-4)", () => {
        assert.equal(estimateTokens(10, "m"), 3 + 4096);
        assert.equal(
            estimateTokens(8, "big", {
                bytesPerToken: 2,
                outputTokens: 100,
                outputTokensByModel: { big: 1000 }
            }),
            1004
        );
        assert.equal(
            estimateTokens(0, "toString", DEFAULT_USAGE_ESTIMATE),
            4096,
            "only own keys override"
        );
    });

    it("parses estimate settings from the environment", () => {
        assert.deepEqual(parseUsageEstimateConfig({}), DEFAULT_USAGE_ESTIMATE);
        assert.deepEqual(
            parseUsageEstimateConfig({
                USAGE_ESTIMATE_BYTES_PER_TOKEN: "3",
                USAGE_ESTIMATE_OUTPUT_TOKENS: "0",
                USAGE_ESTIMATE_OUTPUT_TOKENS_BY_MODEL: '{"a":10}'
            }),
            {
                bytesPerToken: 3,
                outputTokens: 0,
                outputTokensByModel: { a: 10 }
            }
        );
        for (const env of [
            { USAGE_ESTIMATE_BYTES_PER_TOKEN: "0" },
            { USAGE_ESTIMATE_OUTPUT_TOKENS: "-1" },
            { USAGE_ESTIMATE_OUTPUT_TOKENS_BY_MODEL: "[1]" },
            { USAGE_ESTIMATE_OUTPUT_TOKENS_BY_MODEL: '{"a":1.5}' }
        ]) {
            assert.throws(
                () => parseUsageEstimateConfig(env),
                JSON.stringify(env)
            );
        }
    });

    it("parses and validates observer limits from the environment at startup", () => {
        assert.deepEqual(parseUsageObserverLimits({}), {});
        assert.deepEqual(
            parseUsageObserverLimits({
                USAGE_OBSERVER_MAX_EVENT_BYTES: "1024",
                USAGE_OBSERVER_MAX_JSON_BYTES: "2048"
            }),
            { maxEventBytes: 1024, maxJsonBytes: 2048 }
        );
        for (const env of [
            { USAGE_OBSERVER_MAX_EVENT_BYTES: "0" },
            { USAGE_OBSERVER_MAX_EVENT_BYTES: "abc" },
            { USAGE_OBSERVER_MAX_EVENT_BYTES: "1.5" },
            { USAGE_OBSERVER_MAX_JSON_BYTES: "-1" },
            { USAGE_OBSERVER_MAX_JSON_BYTES: String(16 * 1024 * 1024 + 1) }
        ]) {
            assert.throws(
                () => parseUsageObserverLimits(env),
                JSON.stringify(env)
            );
        }
    });

    it("only rewrites streaming Chat requests that don't already ask for usage (METER-2)", () => {
        const body = (value: unknown) => Buffer.from(JSON.stringify(value));
        const chat = { model: MODEL, stream: true };
        const forwarded = prepareRequestBody(
            "/v1/chat/completions",
            body(chat),
            chat
        );
        assert.equal(forwarded.usageRequested, true);
        assert.deepEqual(JSON.parse(forwarded.body.toString()), {
            ...chat,
            stream_options: { include_usage: true }
        });

        const asked = { ...chat, stream_options: { include_usage: true } };
        const original = body(asked);
        assert.equal(
            prepareRequestBody("/v1/chat/completions", original, asked).body,
            original
        );
        const nonStreaming = { model: MODEL };
        const plain = body(nonStreaming);
        assert.equal(
            prepareRequestBody("/v1/chat/completions", plain, nonStreaming)
                .body,
            plain
        );
        const responses = { model: MODEL, stream: true };
        const responsesBody = body(responses);
        assert.equal(
            prepareRequestBody("/v1/responses", responsesBody, responses).body,
            responsesBody
        );
    });

    it("settles a request exactly once and survives a failing sink (METER-5)", async () => {
        const sink = new RecordingSink();
        const meter = new RequestMeter({
            userId,
            modelAlias: MODEL,
            endpoint: "/v1/responses",
            requestStartedAt: new Date(),
            requestBodyBytes: 4,
            sink,
            estimate: DEFAULT_USAGE_ESTIMATE
        });
        meter.responseStarted(200, "text/event-stream; charset=utf-8");
        meter.write(Buffer.from(responsesStream));
        await Promise.all([
            meter.responseEnded(),
            meter.interrupted(),
            meter.responseEnded(),
            meter.failedBeforeResponse()
        ]);
        assert.equal(sink.settlements.length, 1);
        assert.equal(sink.settlements[0].kind, "measured");

        let attempts = 0;
        const failing = new RequestMeter({
            userId,
            modelAlias: MODEL,
            endpoint: "/v1/responses",
            requestStartedAt: new Date(),
            requestBodyBytes: 4,
            sink: {
                settle: async () => {
                    attempts++;
                    throw new Error("ledger down");
                }
            },
            estimate: DEFAULT_USAGE_ESTIMATE
        });
        const originalError = console.error;
        console.error = () => undefined;
        try {
            failing.responseStarted(200, "text/plain");
            await failing.responseEnded();
            await failing.interrupted();
        } finally {
            console.error = originalError;
        }
        assert.equal(
            attempts,
            1,
            "a failed settlement isn't retried by the meter"
        );
    });
});
