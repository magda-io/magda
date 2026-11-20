/** Synthetic fixtures only. These do not establish provider compatibility. */
import assert from "node:assert/strict";
import http, { RequestListener } from "node:http";
import { once } from "node:events";
import { AddressInfo } from "node:net";
import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import createApp from "../src/createApp.js";
import { startUsageTap, TapObservation } from "./usage-tap.js";

async function listen(handler: RequestListener) {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return {
        server,
        url: new URL(
            `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        )
    };
}
async function close(server: http.Server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
    );
}

const secret = "public-poc-fixture-not-a-secret";
const userId = "00000000-0000-4000-8000-000000000001";
const session = jwt.sign({ userId }, secret, { algorithm: "HS256" });
const alias = "poc-model";
const chatUsage = {
    prompt_tokens: 12,
    completion_tokens: 8,
    total_tokens: 20,
    prompt_tokens_details: { cached_tokens: 4 },
    completion_tokens_details: { reasoning_tokens: 3 }
};
const responsesUsage = {
    input_tokens: 12,
    output_tokens: 8,
    total_tokens: 20,
    input_tokens_details: { cached_tokens: 4 },
    output_tokens_details: { reasoning_tokens: 3 }
};
function sse(data: unknown, event?: string) {
    return `${event ? `event: ${event}\r\n` : ""}data: ${JSON.stringify(
        data
    )}\r\n\r\n`;
}
const chatFixture = Buffer.from(
    [
        ": synthetic fixture\r\n\r\n",
        sse({
            choices: [
                {
                    index: 0,
                    delta: { role: "assistant", content: "synthetic 🐟" }
                }
            ]
        }),
        sse({
            choices: [
                {
                    index: 0,
                    delta: {
                        tool_calls: [
                            {
                                index: 0,
                                id: "fixture",
                                type: "function",
                                function: {
                                    name: "fixture_tool",
                                    arguments: '{"x":'
                                }
                            }
                        ]
                    }
                }
            ]
        }),
        sse({
            choices: [
                {
                    index: 0,
                    delta: {
                        tool_calls: [
                            { index: 0, function: { arguments: "1}" } }
                        ]
                    },
                    finish_reason: "tool_calls"
                }
            ]
        }),
        sse({ choices: [], usage: chatUsage }),
        sse({ choices: [], usage: chatUsage }),
        "data: [DONE]\r\n\r\n"
    ].join("")
);
const responsesFixture = Buffer.from(
    [
        sse(
            { type: "response.created", response: { status: "in_progress" } },
            "response.created"
        ),
        sse(
            { type: "response.function_call_arguments.delta", delta: '{"x":' },
            "response.function_call_arguments.delta"
        ),
        sse(
            { type: "response.function_call_arguments.delta", delta: "1}" },
            "response.function_call_arguments.delta"
        ),
        sse(
            {
                type: "response.function_call_arguments.done",
                arguments: '{"x":1}'
            },
            "response.function_call_arguments.done"
        ),
        sse(
            {
                type: "response.completed",
                response: { status: "completed", usage: responsesUsage }
            },
            "response.completed"
        )
    ].join("")
);

describe("#3934 unchanged MAGDA facade / disposable observation tap", () => {
    const servers: http.Server[] = [];
    let authUrl: string;
    beforeEach(async () => {
        const auth = await listen((req, res) => {
            assert.equal(req.headers["x-magda-session"], session);
            res.setHeader("content-type", "application/json");
            res.end(
                JSON.stringify(
                    req.url?.includes("/whoami")
                        ? { id: userId }
                        : { hasResidualRules: false, result: true }
                )
            );
        });
        servers.push(auth.server);
        authUrl = auth.url.href;
    });
    afterEach(async () => {
        await Promise.all(servers.splice(0).map(close));
    });
    async function facade(url: URL) {
        const running = await listen(
            createApp({
                jwtSecret: secret,
                authApiUrl: authUrl,
                liteLlmUrl: url,
                liteLlmKey: "private-fixture-key",
                allowedModels: new Set([alias])
            })
        );
        servers.push(running.server);
        return running.url;
    }
    async function caller(url: URL, path: string, streaming: boolean) {
        return fetch(new URL(`/v0/v1/${path}`, url), {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "X-Magda-Session": session,
                authorization: "Bearer caller-must-not-reach-provider"
            },
            body: JSON.stringify({ model: alias, stream: streaming })
        });
    }

    for (const [path, fixture] of [
        ["chat/completions", chatFixture],
        ["responses", responsesFixture]
    ] as const) {
        it(`${path}: preserves bytes, status, auth replacement and response headers with fragmented SSE`, async () => {
            let calls = 0;
            const upstream = await listen((req, res) => {
                calls++;
                assert.equal(req.url, `/v1/${path}`);
                assert.equal(
                    req.headers.authorization,
                    "Bearer private-fixture-key"
                );
                assert.equal(req.headers["x-magda-session"], undefined);
                res.writeHead(200, {
                    "content-type": "text/event-stream",
                    "cache-control": "no-cache",
                    "x-request-id": "public-fixture-id",
                    "retry-after": "3"
                });
                let offset = 0;
                function write() {
                    if (offset >= fixture.length) {
                        res.end();
                        return;
                    }
                    const next = Math.min(offset + 7, fixture.length);
                    const bytes = fixture.subarray(offset, next);
                    offset = next;
                    if (res.write(bytes)) setImmediate(write);
                    else res.once("drain", write);
                }
                write();
            });
            servers.push(upstream.server);
            const observations: TapObservation[] = [];
            const tap = await startUsageTap(upstream.url, (r) =>
                observations.push(r)
            );
            servers.push(tap.server);
            const rawUrl = await facade(upstream.url);
            const observedUrl = await facade(tap.url);
            const raw = await caller(rawUrl, path, true);
            const rawBytes = Buffer.from(await raw.arrayBuffer());
            const observed = await caller(observedUrl, path, true);
            const observedBytes = Buffer.from(await observed.arrayBuffer());
            assert.deepEqual(observedBytes, rawBytes);
            assert.deepEqual(observedBytes, fixture);
            for (const header of [
                "content-type",
                "cache-control",
                "x-request-id",
                "retry-after"
            ]) {
                assert.equal(
                    observed.headers.get(header),
                    raw.headers.get(header)
                );
            }
            assert.equal(observed.status, raw.status);
            assert.equal(calls, 2);
            assert.equal(observations.length, 1);
            assert.equal(observations[0].outcome, "end");
            assert.deepEqual(observations[0].usage?.usage, {
                inputTokens: 12,
                outputTokens: 8,
                totalTokens: 20,
                cachedInputTokens: 4,
                reasoningTokens: 3
            });
            assert.equal(observations[0].usage?.missingTerminal, false);
            assert.equal(
                observations[0].usage?.duplicateUsageEvents,
                path === "chat/completions" ? 1 : 0
            );
            const serialized = JSON.stringify(observations);
            for (const privateText of [
                "synthetic",
                "fixture_tool",
                '"arguments":',
                "private-fixture-key",
                session
            ]) {
                assert.equal(serialized.includes(privateText), false);
            }
        });

        it(`${path}: nonstream JSON and provider errors are byte-preserved`, async () => {
            for (const status of [200, 429, 503]) {
                const fixture = Buffer.from(
                    JSON.stringify(
                        status === 200
                            ? {
                                  object:
                                      path === "responses"
                                          ? "response"
                                          : "chat.completion",
                                  ...(path === "responses"
                                      ? { status: "completed" }
                                      : {}),
                                  usage:
                                      path === "responses"
                                          ? responsesUsage
                                          : chatUsage,
                                  output:
                                      "synthetic response not retained in observations"
                              }
                            : {
                                  error: {
                                      message:
                                          "synthetic provider body not retained"
                                  }
                              }
                    )
                );
                const upstream = await listen((_req, res) => {
                    res.writeHead(status, {
                        "content-type": "application/json",
                        "retry-after": "2"
                    });
                    res.end(fixture);
                });
                servers.push(upstream.server);
                const observations: TapObservation[] = [];
                const tap = await startUsageTap(upstream.url, (r) =>
                    observations.push(r)
                );
                servers.push(tap.server);
                const response = await caller(
                    await facade(tap.url),
                    path,
                    false
                );
                assert.equal(response.status, status);
                assert.equal(response.headers.get("retry-after"), "2");
                assert.deepEqual(
                    Buffer.from(await response.arrayBuffer()),
                    fixture
                );
                assert.equal(observations.length, 1);
                assert.equal(observations[0].status, status);
                assert.equal(
                    Boolean(observations[0].usage?.usage),
                    status === 200
                );
                assert.equal(
                    JSON.stringify(observations).includes("synthetic"),
                    false
                );
            }
        });
    }

    it("propagates cancellation to the upstream and reports partial metadata once", async () => {
        let markClosed!: () => void;
        const closed = new Promise<void>((resolve) => {
            markClosed = resolve;
        });
        const upstream = await listen((_req, res) => {
            res.writeHead(200, { "content-type": "text/event-stream" });
            res.write(
                sse({
                    choices: [
                        { delta: { role: "assistant", content: "synthetic" } }
                    ]
                })
            );
            res.once("close", markClosed);
        });
        servers.push(upstream.server);
        const observations: TapObservation[] = [];
        const tap = await startUsageTap(upstream.url, (r) =>
            observations.push(r)
        );
        servers.push(tap.server);
        const url = await facade(tap.url);
        const controller = new AbortController();
        const response = await fetch(new URL("/v0/v1/chat/completions", url), {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "X-Magda-Session": session
            },
            body: JSON.stringify({ model: alias, stream: true }),
            signal: controller.signal
        });
        const reader = response.body!.getReader();
        await reader.read();
        controller.abort();
        await reader.cancel().catch(() => undefined);
        await closed;
        assert.equal(observations.length, 1);
        assert.equal(observations[0].outcome, "cancelled");
        assert.equal(observations[0].usage?.missingTerminal, true);
        assert.equal(observations[0].usage?.usage, undefined);
    });

    it("preserves a large stream with a native slow reader and bounded event memory", async () => {
        const sent = createHash("sha256");
        let sourceBackpressure = 0;
        const filler = Buffer.alloc(64 * 1024, "x");
        const tail = Buffer.from(
            "\n\n" + sse({ choices: [], usage: chatUsage }) + "data: [DONE]\n\n"
        );
        const upstream = await listen((_req, res) => {
            res.writeHead(200, { "content-type": "text/event-stream" });
            sent.update("data: ");
            res.write("data: ");
            let remaining = 128; // 8 MiB fixture, never collected into an array.
            function write() {
                if (!remaining--) {
                    sent.update(tail);
                    res.end(tail);
                    return;
                }
                sent.update(filler);
                if (res.write(filler)) setImmediate(write);
                else {
                    sourceBackpressure++;
                    res.once("drain", write);
                }
            }
            write();
        });
        servers.push(upstream.server);
        const observations: TapObservation[] = [];
        const tap = await startUsageTap(upstream.url, (r) =>
            observations.push(r)
        );
        servers.push(tap.server);
        const received = createHash("sha256");
        await new Promise<void>((resolve, reject) => {
            http.get(tap.url, (response) => {
                response.on("data", (chunk) => {
                    received.update(chunk);
                    response.pause();
                    setImmediate(() => response.resume());
                });
                response.once("end", resolve);
                response.once("error", reject);
            }).once("error", reject);
        });
        assert.equal(received.digest("hex"), sent.digest("hex"));
        assert.ok(sourceBackpressure > 0);
        assert.equal(observations.length, 1);
        assert.equal(observations[0].usage?.oversizedEvents, 1);
        assert.equal(observations[0].usage?.peakBufferedBytes, 64 * 1024);
        assert.equal(observations[0].usage?.usage?.totalTokens, 20);
    });

    it("rejects invalid tap setup before accepting connections", async () => {
        await assert.rejects(
            startUsageTap(new URL("file:///tmp/not-a-backend"), () => undefined)
        );
        await assert.rejects(
            startUsageTap(new URL("http://127.0.0.1"), () => undefined, {
                timeoutMs: NaN
            })
        );
    });

    it("cleans up idle upstream timeouts without inventing usage", async () => {
        let markClosed!: () => void;
        const closed = new Promise<void>((resolve) => {
            markClosed = resolve;
        });
        const upstream = await listen((_req, res) => {
            res.once("close", markClosed);
        });
        servers.push(upstream.server);
        const observations: TapObservation[] = [];
        const tap = await startUsageTap(
            upstream.url,
            (r) => observations.push(r),
            { timeoutMs: 40 }
        );
        servers.push(tap.server);
        await assert.rejects(fetch(tap.url, { method: "POST" }));
        await closed;
        assert.equal(observations.length, 1);
        assert.equal(observations[0].outcome, "timeout");
        assert.equal(observations[0].usage, undefined);
    });
});
