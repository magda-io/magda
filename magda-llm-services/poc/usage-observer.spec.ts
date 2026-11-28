import assert from "node:assert/strict";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createUsageObserver, UsageObserver } from "./usage-observer.js";

const chatUsage = {
    prompt_tokens: 20,
    completion_tokens: 10,
    total_tokens: 30,
    prompt_tokens_details: { cached_tokens: 12 },
    completion_tokens_details: { reasoning_tokens: 4 }
};
const expectedUsage = {
    inputTokens: 20,
    outputTokens: 10,
    totalTokens: 30,
    reasoningTokens: 4,
    cachedInputTokens: 12
};
const chat = (usage: unknown = chatUsage) => ({
    object: "chat.completion.chunk",
    choices: [],
    usage
});
const frame = (value: unknown, separator = "\n") =>
    `data: ${JSON.stringify(value)}${separator}${separator}`;
const done = "data: [DONE]\n\n";
function observe(body: string | Buffer, format: "sse" | "json" = "sse") {
    const observer = createUsageObserver({ format });
    observer.write(Buffer.isBuffer(body) ? body : Buffer.from(body));
    return observer.finish();
}

describe("disposable bounded usage observer (#3934)", () => {
    for (const newline of ["\n", "\r\n", "\r"]) {
        it(`handles fragmented UTF-8, multiline data and ${JSON.stringify(
            newline
        )} framing at every split`, () => {
            const stream = Buffer.from(
                [
                    ": keepalive",
                    "",
                    "event: chat.completion.chunk",
                    'data: {"object":"chat.completion.chunk",',
                    'data: "choices":[{"delta":{"content":"hello 🐟 café 中文"}}]}',
                    "",
                    `data: ${JSON.stringify(chat())}`,
                    "",
                    "data: [DONE]",
                    "",
                    ""
                ].join(newline)
            );
            for (let split = 0; split <= stream.length; split++) {
                const observer = new UsageObserver({ format: "sse" });
                observer.write(stream.subarray(0, split));
                observer.write(stream.subarray(split));
                const result = observer.finish();
                assert.deepEqual(result.usage, expectedUsage);
                assert.equal(result.eventsSeen, 3);
                assert.equal(result.bytesObserved, stream.length);
                assert.equal(result.malformedEvents, 0);
                assert.equal(result.terminalSeen, true);
                assert.equal(result.missingTerminal, false);
            }
        });
    }

    it("handles a one-byte-at-a-time mixed-line-ending stream and initial BOM", () => {
        const source = Buffer.from(
            "\uFEFF: comment\r\n\r" + frame(chat(), "\r") + done
        );
        const observer = new UsageObserver({ format: "sse" });
        for (const byte of source) observer.write(Buffer.from([byte]));
        assert.deepEqual(observer.finish().usage, expectedUsage);
        assert.equal(observer.finish().malformedEvents, 0);
    });

    it("treats tool-call/content chunks as opaque and never sums duplicate terminal usage", () => {
        const source =
            frame({
                object: "chat.completion.chunk",
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    function: {
                                        name: "SECRET_TOOL",
                                        arguments: "SECRET_ARGS"
                                    }
                                }
                            ]
                        }
                    }
                ]
            }) +
            frame(chat()) +
            frame(chat()) +
            done +
            done;
        const result = observe(source);
        assert.deepEqual(result.usage, expectedUsage);
        assert.equal(result.usageEvents, 2);
        assert.equal(result.duplicateUsageEvents, 1);
        assert.equal(result.terminalEvents, 2);
        assert.ok(!JSON.stringify(result).includes("SECRET"));
    });

    it("replaces interim zero/conflicting snapshots with latest usage without adding or merging", () => {
        const result = observe(
            frame(chat({ prompt_tokens: 0, completion_tokens: 0 })) +
                frame(chat()) +
                frame(chat()) +
                frame(
                    chat({
                        prompt_tokens: 100,
                        completion_tokens: 50,
                        total_tokens: 150
                    })
                ) +
                done
        );
        assert.deepEqual(result.usage, {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150
        });
        assert.equal(result.usageEvents, 4);
        assert.equal(result.duplicateUsageEvents, 1);
    });

    it("does not mistake Chat finish_reason for the stream's final metadata marker", () => {
        const source =
            frame({ choices: [{ finish_reason: "tool_calls" }], usage: null }) +
            frame(chat());
        const result = observe(source);
        assert.equal(result.terminalSeen, false);
        assert.equal(result.missingTerminal, true);
        assert.deepEqual(result.usage, expectedUsage);
        assert.equal(observe(source + done).missingTerminal, false);
    });

    it("extracts Responses nested terminal usage and validated reasoning/cache subsets", () => {
        const usage = {
            input_tokens: 20,
            output_tokens: 10,
            total_tokens: 30,
            input_tokens_details: { cached_tokens: 12 },
            output_tokens_details: { reasoning_tokens: 4 }
        };
        const terminal = { type: "response.completed", response: { usage } };
        const result = observe(
            frame({
                type: "response.function_call_arguments.delta",
                delta: "PRIVATE_ARGUMENTS"
            }) +
                frame(terminal) +
                frame(terminal)
        );
        assert.deepEqual(result.usage, expectedUsage);
        assert.equal(result.eventTypes["response.completed"], 2);
        assert.equal(
            result.eventTypes["response.function_call_arguments.delta"],
            1
        );
        assert.equal(result.duplicateUsageEvents, 1);
        assert.equal(result.terminalEvents, 2);
        assert.ok(!JSON.stringify(result).includes("PRIVATE"));
    });

    it("records allowlisted terminal/error types but never provider errors or unknown event names", () => {
        const result = observe(
            'event: SECRET_PROVIDER_TYPE\ndata: {"error":"SECRET_PROVIDER_ERROR"}\n\n' +
                frame({
                    type: "error",
                    error: { message: "SECRET_ERROR", code: "SECRET_CODE" }
                }) +
                frame({
                    type: "response.failed",
                    response: { error: { message: "SECRET_MESSAGE" } }
                }) +
                frame({
                    type: "response.incomplete",
                    response: {
                        incomplete_details: { reason: "SECRET_REASON" }
                    }
                })
        );
        assert.equal(result.unknownEventTypes, 1);
        assert.equal(result.eventTypes.error, 1);
        assert.equal(result.terminalEvents, 2);
        assert.equal(result.usage, undefined);
        assert.ok(!JSON.stringify(result).includes("SECRET"));
    });

    it("allowlists content-part events and response objects without retaining their data", () => {
        const result = observe(
            frame({
                type: "response.content_part.added",
                part: { text: "SECRET_PART" }
            }) +
                frame({
                    type: "response.content_part.done",
                    part: { text: "SECRET_PART" }
                })
        );
        assert.equal(result.eventTypes["response.content_part.added"], 1);
        assert.equal(result.eventTypes["response.content_part.done"], 1);
        assert.equal(result.unknownEventTypes, 0);
        assert.ok(!JSON.stringify(result).includes("SECRET"));
        const json = observe(
            JSON.stringify({ object: "response", status: "completed" }),
            "json"
        );
        assert.equal(json.eventTypes.response, 1);
        assert.equal(json.unknownEventTypes, 0);
    });

    it("ignores comments, id/retry/unknown fields, event-only frames and empty frames", () => {
        const result = observe(
            ": comment\n\nid: SECRET_ID\nretry: 10\nfoo: SECRET_FIELD\n\nevent: SECRET_TYPE\n\n\n" +
                done
        );
        assert.equal(result.eventsSeen, 1);
        assert.equal(result.unknownEventTypes, 0);
        assert.equal(result.malformedEvents, 0);
        assert.ok(!JSON.stringify(result).includes("SECRET"));
    });

    it("counts malformed JSON, recovers for the next event, and handles JSON scalars", () => {
        const result = observe(
            "data: {bad SECRET_JSON\n\n" +
                frame(null) +
                frame(["SECRET_ARRAY"]) +
                frame(7) +
                frame(chat()) +
                done
        );
        assert.equal(result.malformedEvents, 1);
        assert.deepEqual(result.usage, expectedUsage);
        assert.ok(!JSON.stringify(result).includes("SECRET"));
    });

    it("skips/counts an oversized event once and resynchronizes after fragmented boundaries", () => {
        const observer = new UsageObserver({
            format: "sse",
            maxEventBytes: 512
        });
        observer.write(Buffer.from("data: " + "S".repeat(100_000)));
        observer.write(Buffer.from("\r"));
        observer.write(Buffer.from("\n\r"));
        observer.write(Buffer.from("\n" + frame(chat()) + done));
        const result = observer.finish();
        assert.equal(result.oversizedEvents, 1);
        assert.equal(result.incompleteEvents, 0);
        assert.equal(result.malformedEvents, 0);
        assert.equal(result.peakBufferedBytes, 512);
        assert.deepEqual(result.usage, expectedUsage);
    });

    it("bounds long comments/unknown fields as well as data and counts distinct oversize events", () => {
        const observer = new UsageObserver({
            format: "sse",
            maxEventBytes: 64
        });
        observer.write(
            Buffer.from(
                ":" +
                    "x".repeat(10000) +
                    "\n\nid: " +
                    "y".repeat(10000) +
                    "\n\n" +
                    done
            )
        );
        const result = observer.finish();
        assert.equal(result.oversizedEvents, 2);
        assert.equal(result.peakBufferedBytes, 64);
        assert.equal(result.terminalSeen, true);
    });

    it("drops cancellation-like incomplete frames instead of parsing partial terminal usage", () => {
        for (const tail of [
            'data: {"type":"response.completed"',
            "data: [DONE]",
            frame(chat()).slice(0, -1)
        ]) {
            const result = observe(
                frame({
                    choices: [{ delta: { content: "PRIVATE_PARTIAL" } }]
                }) + tail
            );
            assert.equal(result.incompleteEvents, 1);
            assert.equal(result.terminalSeen, false);
            assert.equal(result.missingTerminal, true);
            assert.equal(result.usage, undefined);
            assert.ok(!JSON.stringify(result).includes("PRIVATE"));
        }
    });

    it("marks missing terminal independently of whether complete usage was observed", () => {
        const result = observe(frame(chat()));
        assert.deepEqual(result.usage, expectedUsage);
        assert.equal(result.incompleteEvents, 0);
        assert.equal(result.missingTerminal, true);
        assert.equal(observe("").missingTerminal, true);
    });

    it("counts an oversized unterminated event without retaining its tail", () => {
        const observer = new UsageObserver({
            format: "sse",
            maxEventBytes: 10
        });
        observer.write(Buffer.from("data: " + "x".repeat(10000)));
        const result = observer.finish();
        assert.equal(result.oversizedEvents, 1);
        assert.equal(result.incompleteEvents, 1);
        assert.equal(result.peakBufferedBytes, 10);
    });

    it("handles fragmented non-streaming Chat and Responses JSON", () => {
        for (const response of [
            {
                ...chat(),
                object: "chat.completion",
                choices: [{ message: { content: "PRIVATE_🐟" } }]
            },
            {
                object: "response",
                status: "completed",
                usage: {
                    input_tokens: 20,
                    output_tokens: 10,
                    total_tokens: 30,
                    input_tokens_details: { cached_tokens: 12 },
                    output_tokens_details: { reasoning_tokens: 4 }
                },
                output: ["PRIVATE_🐟"]
            }
        ]) {
            const observer = new UsageObserver({ format: "json" });
            for (const byte of Buffer.from(JSON.stringify(response)))
                observer.write(Buffer.from([byte]));
            const result = observer.finish();
            assert.deepEqual(result.usage, expectedUsage);
            assert.equal(result.terminalSeen, true);
            assert.equal(result.eventsSeen, 1);
            assert.ok(!JSON.stringify(result).includes("PRIVATE"));
        }
    });

    it("freezes Chat usage at DONE and ignores later conflicting or newly appearing usage", () => {
        const zero = chat({ prompt_tokens: 0, completion_tokens: 0 });
        const result = observe(
            frame(chat()) + done + frame(zero) + frame(chat()) + done
        );
        assert.deepEqual(result.usage, expectedUsage);
        assert.equal(result.usageFinal, true);
        assert.equal(result.duplicateUsageEvents, 1);
        assert.equal(result.usageEvents, 3);
        const absent = observe(done + frame(chat()));
        assert.equal(absent.usage, undefined);
        assert.equal(absent.usageFinal, false);
        assert.equal(absent.terminalSeen, true);
    });

    it("prefers Responses terminal usage over interim then freezes despite later conflicting terminal/events", () => {
        const usage = { input_tokens: 20, output_tokens: 10, total_tokens: 30 };
        const final = { type: "response.completed", response: { usage } };
        const result = observe(
            frame({
                type: "response.in_progress",
                response: { usage: { input_tokens: 0, output_tokens: 0 } }
            }) +
                frame(final) +
                frame({
                    type: "response.in_progress",
                    response: { usage: { input_tokens: 0, output_tokens: 0 } }
                }) +
                frame({
                    type: "response.completed",
                    response: { usage: { input_tokens: 1, output_tokens: 1 } }
                }) +
                frame(final)
        );
        assert.deepEqual(result.usage, {
            inputTokens: 20,
            outputTokens: 10,
            totalTokens: 30
        });
        assert.equal(result.usageFinal, true);
        assert.equal(result.duplicateUsageEvents, 1);
        assert.equal(result.terminalEvents, 3);
    });

    it("retains interim usage as explicitly provisional if Responses terminal lacks valid usage", () => {
        for (const usage of [
            undefined,
            null,
            { input_tokens: -1, output_tokens: 2 }
        ]) {
            const result = observe(
                frame(chat()) +
                    frame({ type: "response.completed", response: { usage } }) +
                    frame(chat({ prompt_tokens: 0, completion_tokens: 0 }))
            );
            assert.deepEqual(result.usage, expectedUsage);
            assert.equal(result.terminalSeen, true);
            assert.equal(result.usageFinal, false);
            assert.equal(result.missingTerminal, false);
        }
    });

    it("classifies supported JSON terminals independently of missing/invalid usage", () => {
        for (const envelope of [
            { object: "chat.completion" },
            { object: "response", status: "completed" },
            { object: "response", status: "failed" },
            { type: "response", status: "incomplete" },
            { type: "response.completed", response: {} }
        ]) {
            for (const usage of [
                undefined,
                null,
                { input_tokens: -1, output_tokens: 2 }
            ]) {
                const result = observe(
                    JSON.stringify({ ...envelope, usage }),
                    "json"
                );
                assert.equal(result.terminalSeen, true);
                assert.equal(result.missingTerminal, false);
                assert.equal(result.usage, undefined);
                assert.equal(result.usageFinal, false);
            }
        }
    });

    it("does not infer a JSON terminal from usage on unknown or in-progress envelopes", () => {
        for (const envelope of [
            {},
            { object: "unsupported" },
            { object: "chat.completion.chunk" },
            { object: "response" },
            { object: "response", status: "queued" },
            { object: "response", status: "in_progress" },
            { type: "response", status: "in_progress" }
        ]) {
            const result = observe(
                JSON.stringify({ ...envelope, usage: chatUsage }),
                "json"
            );
            assert.deepEqual(result.usage, expectedUsage);
            assert.equal(result.terminalSeen, false);
            assert.equal(result.missingTerminal, true);
            assert.equal(result.usageFinal, false);
        }
    });

    it("bounds and discards oversized JSON bodies, and does not recover by parsing a tail", () => {
        const observer = new UsageObserver({
            format: "json",
            maxJsonBytes: 32
        });
        observer.write(Buffer.from("x".repeat(10000)));
        observer.write(Buffer.from(JSON.stringify(chat())));
        const result = observer.finish();
        assert.equal(result.oversizedEvents, 1);
        assert.equal(result.usage, undefined);
        assert.equal(result.malformedEvents, 0);
        assert.equal(result.missingTerminal, true);
        assert.ok(result.peakBufferedBytes <= 32);
    });

    it("reports malformed/empty/truncated JSON without exposing parse errors", () => {
        for (const body of ["{SECRET_BAD", '{"usage":', ""]) {
            const result = observe(body, "json");
            assert.equal(result.malformedEvents + result.incompleteEvents, 1);
            assert.equal(result.usage, undefined);
            assert.equal(result.missingTerminal, true);
            assert.ok(!JSON.stringify(result).includes("SECRET"));
        }
    });

    it("validates integer, finite, nonnegative core tokens and consistent totals", () => {
        for (const usage of [
            { prompt_tokens: -1, completion_tokens: 2 },
            { prompt_tokens: "1", completion_tokens: 2 },
            { prompt_tokens: 1.5, completion_tokens: 2 },
            { prompt_tokens: 1, completion_tokens: null },
            { prompt_tokens: 1 },
            { prompt_tokens: 1, completion_tokens: 2, total_tokens: 100 },
            { prompt_tokens: 1, completion_tokens: 2, total_tokens: "3" },
            { prompt_tokens: 1, completion_tokens: 2, total_tokens: null },
            { prompt_tokens: Number.MAX_SAFE_INTEGER, completion_tokens: 1 },
            { input_tokens: 1e100, output_tokens: 2 },
            "PRIVATE_USAGE"
        ]) {
            const result = observe(frame(chat(usage)) + done);
            assert.equal(result.invalidUsageEvents, 1);
            assert.equal(result.usage, undefined);
        }
        const infinite = observe(
            'data: {"usage":{"prompt_tokens":1e400,"completion_tokens":1}}\n\n'
        );
        assert.equal(infinite.invalidUsageEvents, 1);
    });

    it("derives absent totals, accepts zero, and never adds invalid or valid subsets", () => {
        const result = observe(
            frame(
                chat({
                    prompt_tokens: 0,
                    completion_tokens: 2,
                    prompt_tokens_details: { cached_tokens: 1 },
                    completion_tokens_details: { reasoning_tokens: 3 }
                })
            ) + done
        );
        assert.deepEqual(result.usage, {
            inputTokens: 0,
            outputTokens: 2,
            totalTokens: 2
        });
        for (const subset of [-1, 0.5, "1", null, Number.MAX_SAFE_INTEGER]) {
            const invalid = observe(
                frame(
                    chat({
                        prompt_tokens: 2,
                        completion_tokens: 2,
                        prompt_tokens_details: { cached_tokens: subset },
                        completion_tokens_details: { reasoning_tokens: subset }
                    })
                )
            );
            assert.deepEqual(invalid.usage, {
                inputTokens: 2,
                outputTokens: 2,
                totalTokens: 4
            });
        }
    });

    it("returns detached metadata and makes finish idempotent and writes after finish harmless", () => {
        const observer = new UsageObserver({ format: "sse" });
        observer.write(Buffer.from(frame(chat()) + done));
        assert.equal(observer.getMetadata().finished, false);
        const result = observer.finish();
        const expected = observer.finish();
        result.eventTypes["chat.completion.chunk"] = 999;
        result.usage!.inputTokens = 999;
        observer.write(Buffer.from("PRIVATE_AFTER_FINISH"));
        assert.deepEqual(observer.finish(), expected);
    });

    it("does not mutate/retain caller buffers and is byte-identical through a backpressured forwarding harness", async () => {
        const source = Buffer.from(
            frame({ choices: [{ delta: { content: "🐟 SECRET_TEXT" } }] }) +
                frame(chat()) +
                done
        );
        const chunks = Array.from({ length: source.length }, (_, i) =>
            Buffer.from(source.subarray(i, i + 1))
        );
        const copies = chunks.map((chunk) => Buffer.from(chunk));
        const observer = new UsageObserver({ format: "sse" });
        const received: Buffer[] = [];
        const tap = new Transform({
            highWaterMark: 1,
            transform(chunk: Buffer, _encoding, callback) {
                observer.write(chunk);
                callback(null, chunk);
            },
            flush(callback) {
                observer.finish();
                callback();
            }
        });
        const sink = new Writable({
            highWaterMark: 1,
            write(chunk: Buffer, _encoding, callback) {
                received.push(chunk);
                setImmediate(callback);
            }
        });
        await pipeline(Readable.from(chunks), tap, sink);
        assert.deepEqual(Buffer.concat(received), source);
        assert.equal(received.length, chunks.length);
        received.forEach((chunk, i) => assert.strictEqual(chunk, chunks[i]));
        chunks.forEach((chunk, i) => assert.deepEqual(chunk, copies[i]));
        assert.deepEqual(observer.finish().usage, expectedUsage);

        const owned = Buffer.from(JSON.stringify(chat()));
        const jsonObserver = new UsageObserver({ format: "json" });
        jsonObserver.write(owned);
        owned.fill(0);
        assert.deepEqual(jsonObserver.finish().usage, expectedUsage);
    });

    it("rejects unsafe limits and unsupported formats before observing data", () => {
        for (const value of [
            0,
            -1,
            1.5,
            Infinity,
            Number.MAX_SAFE_INTEGER,
            16 * 1024 * 1024 + 1
        ]) {
            assert.throws(
                () =>
                    new UsageObserver({ format: "sse", maxEventBytes: value }),
                RangeError
            );
            assert.throws(
                () =>
                    new UsageObserver({ format: "json", maxJsonBytes: value }),
                RangeError
            );
        }
        assert.throws(
            () => new UsageObserver({ format: "invalid" as "sse" }),
            TypeError
        );
    });
});
