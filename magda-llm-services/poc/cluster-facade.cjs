#!/usr/bin/env node
/* Run ONLY inside the existing llm-services pod:
 * kubectl exec -i -n magda-demo <llm-services-pod> -- node < magda-llm-services/poc/cluster-facade.cjs
 * No deployment changes, credential output, prompts, or response bodies are emitted.
 * Uses an in-memory, ten-minute default-admin JWT; authorization is still checked
 * by the real facade and authorization API. Requires explicit cluster operator access.
 * This script makes inexpensive REAL provider requests (including forced tool calls).
 */
const jwt = require("jsonwebtoken");
const model = JSON.parse(process.env.ALLOWED_MODELS)[0];
const base = `http://127.0.0.1:${process.env.PORT}/v0/v1`;
const token = jwt.sign(
    { userId: "00000000-0000-4000-8000-000000000000" },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: "10m" }
);
const headers = {
    "X-Magda-Session": token,
    "content-type": "application/json"
};
const say = (x) => console.log(JSON.stringify(x));
const usageFields = [
    "prompt_tokens",
    "completion_tokens",
    "input_tokens",
    "output_tokens",
    "total_tokens"
];
const detailFields = [
    "cached_tokens",
    "cache_write_tokens",
    "reasoning_tokens",
    "audio_tokens",
    "accepted_prediction_tokens",
    "rejected_prediction_tokens"
];
const eventTypes = new Set([
    "response.created",
    "response.in_progress",
    "response.output_item.added",
    "response.content_part.added",
    "response.output_text.delta",
    "response.output_text.done",
    "response.content_part.done",
    "response.output_item.done",
    "response.completed",
    "response.incomplete",
    "response.failed",
    "response.function_call_arguments.delta",
    "response.function_call_arguments.done",
    "error"
]);
function usage(u) {
    if (!u || typeof u !== "object") return undefined;
    const result = {};
    for (const k of usageFields) if (Number.isFinite(u[k])) result[k] = u[k];
    for (const k of [
        "prompt_tokens_details",
        "completion_tokens_details",
        "input_tokens_details",
        "output_tokens_details"
    ]) {
        if (u[k] && typeof u[k] === "object")
            result[k] = Object.fromEntries(
                detailFields
                    .filter((n) => Number.isFinite(u[k][n]))
                    .map((n) => [n, u[k][n]])
            );
    }
    return Object.keys(result).length ? result : undefined;
}
async function call(label, endpoint, body, cancel = false, timeout = 45000) {
    if (
        process.env.POC_CASES &&
        !process.env.POC_CASES.split(",").includes(label)
    )
        return { meta: { skipped: true }, toolCalls: [], outputItems: [] };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const meta = {
        case: label,
        endpoint,
        stream: !!body.stream,
        status: undefined,
        eventCounts: {},
        usage: [],
        done: false,
        roleChunks: 0,
        contentChunks: 0,
        toolArgumentChunks: 0,
        toolBoundaries: 0
    };
    const toolCalls = new Map();
    const outputItems = [];
    let json, observer;
    const crypto = require("node:crypto");
    const before = crypto.createHash("sha256"),
        after = crypto.createHash("sha256");
    function observe(bytes) {
        before.update(bytes);
        observer?.write(bytes);
        after.update(bytes);
    }
    try {
        const res = await fetch(base + "/" + endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: ctrl.signal
        });
        meta.status = res.status;
        meta.contentType = res.headers.get("content-type")?.split(";")[0];
        observer = globalThis.__pocCreateUsageObserver?.({
            format: meta.contentType?.includes("event-stream") ? "sse" : "json",
            api: endpoint === "responses" ? "responses" : "chat"
        });
        if (
            !body.stream ||
            !res.ok ||
            !meta.contentType?.includes("event-stream")
        ) {
            const bytes = Buffer.from(await res.arrayBuffer());
            observe(bytes);
            if (bytes.length > 1024 * 1024) throw new Error("body-limit");
            json = JSON.parse(bytes.toString("utf8"));
            meta.usage = usage(json.usage) ? [usage(json.usage)] : [];
            if (json.error)
                meta.error = {
                    type: [
                        "invalid_request_error",
                        "authentication_error",
                        "rate_limit_error",
                        "server_error"
                    ].includes(json.error.type)
                        ? json.error.type
                        : "other",
                    code: [
                        "400",
                        "401",
                        "403",
                        "404",
                        "429",
                        "500",
                        "502",
                        "503",
                        "unsupported_value",
                        "unsupported_parameter",
                        "invalid_api_key"
                    ].includes(String(json.error.code))
                        ? String(json.error.code)
                        : "other"
                };
        } else {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let pending = "";
            outer: while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                observe(Buffer.from(value));
                pending = (
                    pending + decoder.decode(value, { stream: true })
                ).replace(/\r\n/g, "\n");
                if (pending.length > 1024 * 1024)
                    throw new Error("frame-limit");
                let split;
                while ((split = pending.indexOf("\n\n")) !== -1) {
                    const frame = pending.slice(0, split);
                    pending = pending.slice(split + 2);
                    const data = frame
                        .split("\n")
                        .filter((x) => x.startsWith("data:"))
                        .map((x) => x.slice(5).trimStart())
                        .join("\n");
                    if (!data) continue;
                    if (data === "[DONE]") {
                        meta.done = true;
                        continue;
                    }
                    const event = JSON.parse(data);
                    const eventType = event.type
                        ? eventTypes.has(event.type)
                            ? event.type
                            : "other"
                        : "chat.chunk";
                    meta.eventCounts[eventType] =
                        (meta.eventCounts[eventType] || 0) + 1;
                    const u = usage(event.usage || event.response?.usage);
                    if (u && meta.usage.length < 16) meta.usage.push(u);
                    if (
                        [
                            "response.completed",
                            "response.incomplete",
                            "response.failed"
                        ].includes(event.type)
                    ) {
                        meta.done = true;
                        meta.responseTerminal = event.type;
                    }
                    if (
                        event.type === "response.output_item.added" &&
                        event.item?.type === "function_call"
                    )
                        meta.toolBoundaries++;
                    if (
                        event.type === "response.output_item.done" &&
                        event.item &&
                        outputItems.length < 16
                    )
                        outputItems.push(event.item);
                    if (event.type === "response.function_call_arguments.delta")
                        meta.toolArgumentChunks++;
                    if (event.type === "response.output_text.delta")
                        meta.contentChunks++;
                    for (const choice of event.choices || []) {
                        const d = choice.delta || {};
                        if (d.role) meta.roleChunks++;
                        if (d.content) meta.contentChunks++;
                        for (const t of d.tool_calls || []) {
                            const old = toolCalls.get(t.index) || {
                                id: "",
                                type: "function",
                                function: { name: "", arguments: "" }
                            };
                            if (t.id) {
                                old.id = t.id;
                                meta.toolBoundaries++;
                            }
                            if (t.function?.name)
                                old.function.name += t.function.name;
                            if (t.function?.arguments) {
                                old.function.arguments += t.function.arguments;
                                meta.toolArgumentChunks++;
                            }
                            if (
                                old.function.arguments.length > 65536 ||
                                toolCalls.size > 16
                            )
                                throw new Error("tool-limit");
                            toolCalls.set(t.index, old);
                        }
                    }
                    if (
                        cancel &&
                        (meta.contentChunks || meta.toolArgumentChunks)
                    ) {
                        meta.cancelled = true;
                        ctrl.abort();
                        await reader.cancel().catch(() => {});
                        break outer;
                    }
                }
            }
            meta.incompleteFrame = pending.length > 0;
        }
    } catch (e) {
        meta.transportError = e.name;
    } finally {
        clearTimeout(timer);
    }
    if (observer) {
        meta.observation = observer.finish();
        meta.observerBytesUnchanged =
            before.digest("hex") === after.digest("hex");
    }
    meta.usageEvents = meta.usage.length;
    meta.totalEqualsInputPlusOutput = meta.usage.every(
        (u) =>
            u.total_tokens ===
            (u.prompt_tokens ?? u.input_tokens) +
                (u.completion_tokens ?? u.output_tokens)
    );
    say(meta);
    return { meta, json, toolCalls: [...toolCalls.values()], outputItems };
}
async function main() {
    const auth = await fetch(base + "/models", {
        headers,
        signal: AbortSignal.timeout(15000)
    });
    say({
        case: "authorization",
        status: auth.status,
        model,
        realFacade: true
    });
    if (!auth.ok) return;
    const chat = {
        model,
        messages: [{ role: "user", content: "Say OK." }],
        max_completion_tokens: 256
    };
    const responses = { model, input: "Say OK.", max_output_tokens: 512 };
    await call("chat-nonstream", "chat/completions", chat);
    await call("responses-nonstream", "responses", responses);
    for (const include of [undefined, false, true]) {
        const variant =
            include === undefined
                ? {}
                : { stream_options: { include_usage: include } };
        await call(`chat-stream-${String(include)}`, "chat/completions", {
            ...chat,
            stream: true,
            ...variant
        });
        await call(`responses-stream-${String(include)}`, "responses", {
            ...responses,
            stream: true,
            ...variant
        });
    }
    const fn = {
        name: "poc_number",
        parameters: {
            type: "object",
            properties: { n: { type: "integer" } },
            required: ["n"],
            additionalProperties: false
        }
    };
    for (const include of [false, true]) {
        const messages = [
            {
                role: "user",
                content:
                    "Call poc_number with n=2 once, then after its result say OK."
            }
        ];
        const r = await call(`chat-tool-${include}`, "chat/completions", {
            ...chat,
            messages,
            tools: [{ type: "function", function: fn }],
            tool_choice: "auto",
            reasoning_effort: "low",
            stream: true,
            stream_options: { include_usage: include }
        });
        if (r.toolCalls.length) {
            messages.push({
                role: "assistant",
                content: null,
                tool_calls: r.toolCalls
            });
            for (const t of r.toolCalls)
                messages.push({
                    role: "tool",
                    tool_call_id: t.id,
                    content: "2"
                });
            await call(
                `chat-tool-continuation-${include}`,
                "chat/completions",
                {
                    ...chat,
                    messages,
                    stream: true,
                    stream_options: { include_usage: include }
                }
            );
        }
    }
    const rt = await call("responses-tool", "responses", {
        ...responses,
        input: "Call poc_number with n=2 once, then after its result say OK.",
        tools: [{ type: "function", ...fn }],
        tool_choice: { type: "function", name: fn.name },
        stream: true
    });
    const calls = rt.outputItems.filter((x) => x.type === "function_call");
    if (calls.length)
        await call("responses-tool-continuation", "responses", {
            ...responses,
            input: [
                ...rt.outputItems,
                ...calls.map((c) => ({
                    type: "function_call_output",
                    call_id: c.call_id,
                    output: "2"
                }))
            ],
            stream: true
        });
    await call("invalid-chat-max-tokens", "chat/completions", {
        model,
        messages: chat.messages,
        max_tokens: 32
    });
    await call("invalid-model", "chat/completions", {
        ...chat,
        model: "poc-not-allowed"
    });
    await call(
        "client-cancel",
        "chat/completions",
        {
            ...chat,
            messages: [{ role: "user", content: "Count from one to fifty." }],
            stream: true,
            stream_options: { include_usage: true }
        },
        true
    );
    await call(
        "client-deadline-1ms",
        "chat/completions",
        { ...chat, stream: true },
        false,
        1
    );
}
main().catch((e) => {
    say({ case: "fatal", errorName: e.name });
    process.exitCode = 1;
});
