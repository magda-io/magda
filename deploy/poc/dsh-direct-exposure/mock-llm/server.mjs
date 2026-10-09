// Deterministic OpenAI Chat Completions mock for the #3841 transport tests.
// It lets the DSH streaming/cancellation/reconnect tests run without a real
// LLM provider or credential. Behaviour is chosen by the latest user message:
//
//   "STREAM <seconds> [tag]"  stream one numbered token every 500 ms for
//                       <seconds>, then "stream complete <tag>"
//                       (long-lived server -> browser streaming; cancel mid-way)
//   "BASH <command>"    call the `bash` tool with <command>, then report the
//                       tool output in the next turn (agent tool activity)
//   anything else       short echo reply, streamed word by word
//
// Only `POST /v1/chat/completions` with `stream: true` and `GET /v1/models`
// are implemented. No dependencies.
import http from "node:http";

const port = Number(process.env.PORT || 8080);
const model = process.env.MOCK_MODEL || "mock-stream";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function textOf(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .map((part) => (typeof part === "string" ? part : part?.text || ""))
            .join("");
    }
    return "";
}

function chunk(id, delta, finishReason = null) {
    return `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta, finish_reason: finishReason }]
    })}\n\n`;
}

async function streamReply(req, res, body) {
    const id = `chatcmpl-mock-${Date.now()}`;
    let aborted = false;
    res.on("close", () => {
        if (!res.writableFinished) aborted = true;
    });
    res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive"
    });
    const messages = body.messages || [];
    const last = messages[messages.length - 1] || {};
    // The current turn = user messages after the last assistant message (DSH
    // appends context such as the sampled time as extra user content).
    let start = messages.length;
    while (start > 0 && messages[start - 1].role !== "assistant") start--;
    const prompt = messages
        .slice(start)
        .filter((m) => m.role === "user")
        .map((m) => textOf(m.content))
        .join("\n")
        .trim();
    const send = (delta, finish) => {
        if (!aborted) res.write(chunk(id, delta, finish));
    };
    send({ role: "assistant", content: "" });
    const kind = /^Generate the session title/i.test(prompt) ? "title" : last.role === "tool" ? "tool-result" : /STREAM\s+\d+/i.test(prompt) ? "stream" : /BASH\s/i.test(prompt) ? "bash" : "echo";
    console.log(`stream ${id} start kind=${kind} tools=${(body.tools || []).length} prompt=${JSON.stringify(prompt.split("\n")[0].slice(0, 60))}`);
    res.on("close", () => console.log(`stream ${id} ${aborted ? "aborted" : "finished"}`));

    // DSH's session-title request embeds the prompt; answer it with a fixed
    // title so it never matches the STREAM/BASH behaviours.
    const isTitle = /^Generate the session title/i.test(prompt);
    const streamMatch = !isTitle && /STREAM\s+(\d+)/i.exec(prompt);
    const bashMatch = !isTitle && /BASH\s+(.+)$/is.exec(prompt);
    if (isTitle) {
        send({ content: "Mock session" });
        send({}, "stop");
    } else if (last.role === "tool") {
        const output = textOf(last.content).slice(0, 400);
        for (const word of `Tool finished. Output: ${output}`.split(/(\s+)/)) {
            send({ content: word });
            await sleep(20);
        }
        send({}, "stop");
    } else if (bashMatch && (body.tools || []).length) {
        const tool =
            body.tools.find((t) => t.function?.name === "bash") ||
            body.tools.find((t) => /bash/i.test(t.function?.name || ""));
        send({ content: "Running the command.\n" });
        send({
            tool_calls: [
                {
                    index: 0,
                    id: `call_${Date.now()}`,
                    type: "function",
                    function: {
                        name: tool?.function?.name || "bash",
                        arguments: JSON.stringify({
                            description: "mock tool call",
                            command: bashMatch[1].trim()
                        })
                    }
                }
            ]
        });
        send({}, "tool_calls");
    } else if (streamMatch) {
        const seconds = Math.min(Number(streamMatch[1]), 3600);
        const started = Date.now();
        let n = 0;
        while (!aborted && Date.now() - started < seconds * 1000) {
            send({ content: `tick-${++n} ` });
            await sleep(500);
        }
        if (aborted) {
            console.log(`stream ${id} cancelled by client after ${n} ticks`);
        }
        const tag = (/STREAM\s+\d+\s+(\S+)/i.exec(prompt) || [])[1] || "";
        send({ content: `\nstream complete ${tag}`.trimEnd() }, "stop");
    } else {
        const firstLine = prompt.split("\n")[0] || "(empty)";
        for (const word of `Mock reply to: ${firstLine}`.split(/(\s+)/)) {
            send({ content: word });
            await sleep(30);
        }
        send({}, "stop");
    }
    if (!aborted) {
        res.write(
            `data: ${JSON.stringify({
                id,
                object: "chat.completion.chunk",
                model,
                choices: [],
                usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
            })}\n\n`
        );
        res.end("data: [DONE]\n\n");
    }
}

http.createServer((req, res) => {
    const url = new URL(req.url, "http://mock");
    if (req.method === "GET" && url.pathname.endsWith("/models")) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ object: "list", data: [{ id: model, object: "model" }] }));
    }
    if (req.method === "POST" && url.pathname.endsWith("/chat/completions")) {
        let raw = "";
        req.on("data", (d) => (raw += d));
        req.on("end", () => {
            let body;
            try {
                body = JSON.parse(raw);
            } catch {
                res.writeHead(400);
                return res.end("invalid json");
            }
            streamReply(req, res, body).catch((e) => {
                console.error(e);
                res.destroy();
            });
        });
        return;
    }
    res.writeHead(404);
    res.end("not found");
}).listen(port, () => console.log(`mock-llm listening on :${port}`));
