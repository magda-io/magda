#!/usr/bin/env node
/**
 * Real, built-image Web qualification; no source loader, build, browser, or keys.
 * Run ONLY in a disposable, pristine image/container, as its default nonroot user:
 *   docker run --rm --network none -e MAGDA_IMAGE_TEST=1 \
 *     -v "$PWD/magda-agent-runtime/test-image-web.mjs:/tmp/test-image-web.mjs:ro" \
 *     --entrypoint node IMAGE /tmp/test-image-web.mjs
 * `--network none` still permits the loopback fixtures and prevents any egress.
 * Stock entrypoint hard-codes /data/{config,workspace}; temporary symlinks below
 * redirect those two empty directories into /tmp. No existing user data accepted.
 * This is NOT a Manager, Kubernetes, KAS, ingress, or browser-rendering test.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
    access,
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    readlink,
    realpath,
    rm,
    rmdir,
    stat,
    symlink,
    writeFile
} from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const ASSEMBLY = "/usr/local/lib/magda-agent/dsh/node_modules";
const ENTRYPOINT = "/usr/local/bin/magda-agent-entrypoint";
const BOOTSTRAP = "/usr/local/bin/magda-agent-bootstrap";
const TIMEOUT = 180_000;
const secrets = new Set();
const children = new Set();
const servers = new Set();
const sockets = new Set();
const redirects = [];
const controller = new AbortController();
let root;
let markerOwned = false;
let lastStage = "preconditions";
const check = (condition, message) => {
    if (!condition) throw new Error(message);
};
const redact = (text) => {
    let safe = String(text).replace(/(\btoken=)[^\s&"'<>)]*/gi, "$1<redacted>");
    for (const secret of secrets) safe = safe.replaceAll(secret, "<redacted>");
    return safe;
};
function stage(message) {
    controller.signal.throwIfAborted();
    lastStage = message;
    console.log(`image-web: ${message}`);
}
const onSignal = () => controller.abort(new Error("test interrupted"));
process.on("SIGTERM", onSignal);
process.on("SIGINT", onSignal);
const watchdog = setTimeout(
    () => controller.abort(new Error("overall test timeout")),
    TIMEOUT
);
watchdog.unref();

async function exists(file) {
    try {
        return await lstat(file);
    } catch (error) {
        if (error.code === "ENOENT") return undefined;
        throw error;
    }
}
function launch(command, args, env) {
    const child = spawn(command, args, {
        env,
        cwd: root,
        detached: true,
        stdio: ["pipe", "pipe", "pipe"]
    });
    const running = { child, output: "", closed: false, error: undefined };
    running.done = new Promise((resolve) => {
        child.once("error", (error) => {
            running.error = error;
        });
        child.once("close", (code, signal) => {
            running.closed = true;
            resolve({ code, signal });
        });
    });
    const capture = (chunk) => {
        running.output = (running.output + chunk.toString()).slice(-80_000);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.stdin.on("error", () => {});
    children.add(running);
    return running;
}
function signalGroup(running, signal) {
    if (running.child.pid === undefined) return;
    try {
        process.kill(-running.child.pid, signal);
    } catch (error) {
        if (error.code !== "ESRCH") throw error;
    }
}
async function stop(running) {
    signalGroup(running, "SIGTERM");
    let timer;
    try {
        await Promise.race([
            running.done,
            new Promise((resolve) => {
                timer = setTimeout(resolve, 8_000);
            })
        ]);
    } finally {
        clearTimeout(timer);
        // Kill the entire owned process group, including descendants of a dead wrapper.
        signalGroup(running, "SIGKILL");
    }
    let hardTimer;
    try {
        await Promise.race([
            running.done,
            new Promise((_, reject) => {
                hardTimer = setTimeout(
                    () =>
                        reject(
                            new Error("owned child did not close after SIGKILL")
                        ),
                    3_000
                );
            })
        ]);
    } finally {
        clearTimeout(hardTimer);
        children.delete(running);
    }
}
async function until(fn, ms, description) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        controller.signal.throwIfAborted();
        const value = await fn();
        if (value) return value;
        await delay(100, undefined, { signal: controller.signal });
    }
    throw new Error(`timeout: ${description}`);
}
async function request(url, { method = "GET", headers = {}, body } = {}) {
    const target = new URL(url);
    check(
        target.protocol === "http:" && target.hostname === "127.0.0.1",
        "request escaped loopback HTTP"
    );
    return new Promise((resolve, reject) => {
        const req = http.request(
            target,
            {
                method,
                headers,
                agent: false,
                signal: AbortSignal.any([
                    controller.signal,
                    AbortSignal.timeout(10_000)
                ])
            },
            (res) => {
                const chunks = [];
                let size = 0;
                res.on("data", (chunk) => {
                    size += chunk.length;
                    if (size > 32 * 1024 * 1024)
                        res.destroy(new Error("response too large"));
                    else chunks.push(chunk);
                });
                res.once("error", reject);
                res.once("end", () =>
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        text: Buffer.concat(chunks).toString("utf8")
                    })
                );
            }
        );
        req.once("error", reject);
        req.end(body);
    });
}
async function rpc(origin, cookie, method, args) {
    const reply = await request(`${origin}/api/${method}`, {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: JSON.stringify({
            type: "client-request",
            rpcId: randomUUID(),
            method,
            payload: { args }
        })
    });
    check(reply.status === 200, `${method}: HTTP ${reply.status}`);
    const envelope = JSON.parse(reply.text);
    check(
        envelope.type === "server-response" && envelope.result?.ok === true,
        `${method}: RPC failed (${
            envelope.result?.error?.code || "bad envelope"
        })`
    );
    return envelope.result.value;
}
async function fixture(handler) {
    const server = http.createServer((req, res) => {
        Promise.resolve(handler(req, res)).catch(() => {
            if (!res.headersSent) res.writeHead(500);
            res.end();
        });
    });
    servers.add(server);
    server.requestTimeout = 10_000;
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    return `http://127.0.0.1:${server.address().port}`;
}
function responseEvents(text) {
    const message = {
        id: "msg_image_fixture",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [], logprobs: [] }]
    };
    const response = {
        id: "resp_image_fixture",
        object: "response",
        created_at: 1,
        status: "completed",
        model: "image-test-model",
        output: [message],
        error: null,
        usage: {
            input_tokens: 10,
            output_tokens: 2,
            total_tokens: 12,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 }
        }
    };
    return [
        {
            type: "response.created",
            response: { ...response, status: "in_progress", output: [] }
        },
        {
            type: "response.output_item.added",
            output_index: 0,
            item: { ...message, status: "in_progress", content: [] }
        },
        {
            type: "response.content_part.added",
            item_id: message.id,
            output_index: 0,
            content_index: 0,
            part: { type: "output_text", text: "", annotations: [] }
        },
        {
            type: "response.output_text.delta",
            item_id: message.id,
            output_index: 0,
            content_index: 0,
            delta: text
        },
        {
            type: "response.output_text.done",
            item_id: message.id,
            output_index: 0,
            content_index: 0,
            text
        },
        {
            type: "response.content_part.done",
            item_id: message.id,
            output_index: 0,
            content_index: 0,
            part: message.content[0]
        },
        { type: "response.output_item.done", output_index: 0, item: message },
        { type: "response.completed", response }
    ]
        .map(
            (event, sequence_number) =>
                `event: ${event.type}\ndata: ${JSON.stringify({
                    ...event,
                    sequence_number
                })}\n\n`
        )
        .join("");
}
async function connect(WebSocket, origin, headers, rejectedStatus) {
    const socket = new WebSocket(
        `${origin.replace("http:", "ws:")}/api/remote.mux`,
        { headers, handshakeTimeout: 10_000, followRedirects: false }
    );
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    await new Promise((resolve, reject) => {
        const finish = (error) => {
            clearTimeout(timer);
            controller.signal.removeEventListener("abort", abort);
            if (error) reject(error);
            else resolve();
        };
        const abort = () => {
            socket.terminate();
            finish(new Error("WebSocket test aborted"));
        };
        const timer = setTimeout(() => {
            socket.terminate();
            finish(new Error("WebSocket handshake timeout"));
        }, 12_000);
        controller.signal.addEventListener("abort", abort, { once: true });
        socket.once("open", () =>
            finish(
                rejectedStatus === undefined
                    ? undefined
                    : new Error("unauthorized WebSocket opened")
            )
        );
        socket.once("error", () =>
            finish(new Error("WebSocket handshake failed"))
        );
        socket.once("unexpected-response", (req, res) => {
            const status = res.statusCode;
            res.resume();
            finish(
                status === rejectedStatus
                    ? undefined
                    : new Error(`WebSocket rejection HTTP ${status}`)
            );
            req.destroy();
        });
    });
    return socket;
}
async function cursor(WebSocket, origin, cookie, sessionId) {
    const socket = await connect(WebSocket, origin, { cookie, origin });
    const streamId = randomUUID();
    try {
        return await new Promise((resolve, reject) => {
            const finish = (error, value) => {
                clearTimeout(timer);
                controller.signal.removeEventListener("abort", abort);
                socket.removeListener("message", message);
                if (error) reject(error);
                else resolve(value);
            };
            const abort = () => finish(new Error("session/follow aborted"));
            const timer = setTimeout(
                () => finish(new Error("session/follow snapshot timeout")),
                10_000
            );
            const message = (data) => {
                try {
                    const frame = JSON.parse(data.toString());
                    if (frame.streamId !== streamId) return;
                    if (
                        frame.type === "item" &&
                        frame.value?.type === "snapshot" &&
                        Number.isSafeInteger(frame.value.cursor)
                    )
                        finish(undefined, frame.value.cursor);
                    else if (frame.type === "error" || frame.type === "end")
                        finish(
                            new Error("session/follow ended before snapshot")
                        );
                } catch {
                    finish(new Error("invalid session/follow frame"));
                }
            };
            controller.signal.addEventListener("abort", abort, { once: true });
            socket.on("message", message);
            socket.once("error", () =>
                finish(new Error("session/follow socket error"))
            );
            socket.send(
                JSON.stringify({
                    type: "open",
                    streamId,
                    endpoint: "session/follow",
                    payload: {
                        args: {
                            request: { address: { kind: "session", sessionId } }
                        }
                    }
                })
            );
        });
    } finally {
        socket.terminate();
    }
}
async function history(WebSocket, origin, cookie, sessionId) {
    const throughSeq = await cursor(WebSocket, origin, cookie, sessionId);
    return rpc(origin, cookie, "session/page", {
        request: {
            address: { kind: "session", sessionId },
            throughSeq,
            maxMessages: 20
        }
    });
}
async function redirectEmptyDataDirectory(name, target) {
    const file = `/data/${name}`;
    const previous = await exists(file);
    check(
        !previous ||
            (previous.isDirectory() && (await readdir(file)).length === 0),
        `/data/${name} must be absent or an empty real directory`
    );
    // A failed later step must still restore any directory already removed.
    const entry = { file, previous, linked: false };
    redirects.push(entry);
    if (previous) await rmdir(file);
    await symlink(target, file);
    entry.linked = true;
}

let failed;
try {
    check(
        process.env.MAGDA_IMAGE_TEST === "1",
        "set MAGDA_IMAGE_TEST=1 in a disposable container; refuses existing user data"
    );
    check(
        process.platform === "linux" &&
            Number(process.versions.node.split(".")[0]) === 22,
        "requires runtime Linux Node22"
    );
    check(process.getuid() !== 0, "must run as image nonroot user");
    await access(ENTRYPOINT, constants.X_OK);
    await access(BOOTSTRAP, constants.R_OK);
    check(
        !(await exists("/data/.created-at")),
        "requires pristine /data (existing creation marker refused)"
    );
    check(
        (await readdir("/data")).every((name) =>
            ["workspace", "config"].includes(name)
        ),
        "requires pristine /data (unexpected entries refused)"
    );
    for (const name of ["workspace", "config"]) {
        const entry = await exists(`/data/${name}`);
        check(
            !entry ||
                (entry.isDirectory() &&
                    (await readdir(`/data/${name}`)).length === 0),
            `existing /data/${name} data refused`
        );
    }
    const provenance = JSON.parse(
        await readFile("/usr/local/share/magda-agent/dsh-source.json", "utf8")
    );
    check(
        /^[a-f0-9]{40}$/.test(provenance.sha) &&
            provenance.packages?.some((pkg) => pkg.name === "@deepseek-ai/dsh"),
        "source provenance missing CLI identity"
    );
    check(
        (
            await realpath("/usr/local/lib/node_modules/@deepseek-ai/dsh")
        ).startsWith(`${ASSEMBLY}/`),
        "global CLI does not resolve to isolated runtime assembly"
    );
    const WebSocket = createRequire(
        `${ASSEMBLY}/@deepseek-ai/dsh/package.json`
    )("ws");
    root = await mkdtemp("/tmp/magda-image-web-");
    for (const name of ["config", "workspace", "home", "data", "agents"])
        await mkdir(path.join(root, name), { recursive: true, mode: 0o700 });
    await redirectEmptyDataDirectory("config", path.join(root, "config"));
    await redirectEmptyDataDirectory("workspace", path.join(root, "workspace"));
    markerOwned = true;
    // Deliberately do not inherit credentials, DSH flags, Node preload hooks, or proxies.
    const env = {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        LANG: "C.UTF-8",
        HOME: path.join(root, "home"),
        TMPDIR: root,
        DSH_HOME: path.join(root, "home/dsh"),
        DSH_AGENTS_HOME: path.join(root, "agents"),
        XDG_CONFIG_HOME: path.join(root, "config"),
        XDG_DATA_HOME: path.join(root, "data"),
        XDG_CACHE_HOME: path.join(root, "cache"),
        DSH_TELEMETRY_DISABLED: "1",
        DSH_TELEMETRY_MODE: "DISABLED",
        DSH_PERMISSION_MODE: "workspace-write",
        DSH_BUNDLED_SKILL_DIR: "/usr/local/lib/magda-agent/skills",
        DSH_BROWSER_AUTH: "true",
        DSH_LAUNCH_TOKEN_FILE: path.join(root, "launch-token"),
        MAGDA_PYTHON_CACHE_ROOT: path.join(
            root,
            "workspace/agent-harness/default-workspace/.cache"
        ),
        UV_CACHE_DIR: path.join(
            root,
            "workspace/agent-harness/default-workspace/.cache/uv"
        ),
        PIP_CACHE_DIR: path.join(
            root,
            "workspace/agent-harness/default-workspace/.cache/pip"
        ),
        MAGDA_PYTHON_TMPDIR: path.join(
            root,
            "workspace/agent-harness/default-workspace/.tmp"
        ),
        MAGDA_PYTHON_VENV_ROOT: path.join(
            root,
            "workspace/agent-harness/default-workspace/.venvs"
        ),
        UV_PYTHON_DOWNLOADS: "never",
        UV_PYTHON_PREFERENCE: "only-system",
        PIP_REQUIRE_VIRTUALENV: "true"
    };
    const assistantMarker = `image-web-assistant-${randomUUID()}`;
    const userMarker = `image-web-user-${randomUUID()}`;
    const llmRequests = [];
    const llm = await fixture(async (req, res) => {
        if (req.method !== "POST" || !req.url.endsWith("/responses")) {
            res.writeHead(404);
            res.end();
            return;
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
            size += chunk.length;
            check(size < 8 * 1024 * 1024, "mock LLM request too large");
            chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        llmRequests.push({ body, authorization: req.headers.authorization });
        res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-store"
        });
        res.end(responseEvents(assistantMarker));
    });
    const magda = await fixture((req, res) => {
        // Empty catalog/skills fixture; no real MAGDA endpoint is contacted.
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
            JSON.stringify({ records: [], hasMore: false, nextPageToken: "" })
        );
    });
    const payload = {
        version: 1,
        userId: "image-fixture-user",
        magda: {
            baseUrl: magda,
            apiKeyId: "image-fixture-key-id",
            apiKey: "image-fixture-magda-key"
        },
        llm: {
            baseUrl: `${llm}/v1`,
            model: "image-test-model",
            contextWindow: 128000,
            maxTokens: 2048,
            authorization: "image-fixture-llm-key",
            reasoningEffort: "medium"
        }
    };
    const bootstrap = async (value) => {
        const running = launch(process.execPath, [BOOTSTRAP], {
            ...env,
            MAGDA_AGENT_BOOTSTRAP_DATA_ROOT: root,
            MAGDA_AGENT_BOOTSTRAP_SKIP_RESTART: "1"
        });
        running.child.stdin.end(JSON.stringify(value));
        await until(() => running.closed, 10_000, "bootstrap exit");
        const result = await running.done;
        check(result.code === 0 && !running.error, "bootstrap failed");
        await stop(running);
    };
    stage("bootstrap credentials and remove stale reasoning setting");
    await bootstrap(payload);
    const envFile = path.join(root, "config/magda-agent.env");
    check(
        (await readFile(envFile, "utf8")).includes(
            "MAGDA_LLM_REASONING_EFFORT='medium'"
        ),
        "bootstrap omitted requested reasoning effort"
    );
    const { reasoningEffort: _omitted, ...withoutReasoning } = payload.llm;
    await bootstrap({ ...payload, llm: withoutReasoning });
    check(
        !(await readFile(envFile, "utf8")).includes(
            "MAGDA_LLM_REASONING_EFFORT"
        ),
        "repeated bootstrap retained stale reasoning effort"
    );
    for (const relative of [
        "config/mgd/config.json",
        "config/magda-agent.env",
        "config/magda-agent-bootstrap.json"
    ]) {
        check(
            ((await stat(path.join(root, relative))).mode & 0o777) === 0o600,
            `bootstrap file mode is not 0600: ${relative}`
        );
    }
    const savedConfig = JSON.parse(
        await readFile(path.join(root, "config/mgd/config.json"), "utf8")
    );
    check(
        savedConfig.profiles[savedConfig.activeProfile].baseUrl === magda,
        "bootstrap MAGDA endpoint mismatch"
    );
    const start = async (port = "0") => {
        await rm(env.DSH_LAUNCH_TOKEN_FILE, { force: true });
        const running = launch(
            ENTRYPOINT,
            ["--host", "127.0.0.1", "--port", port],
            env
        );
        running.child.stdin.end();
        const ready = await until(
            async () => {
                check(
                    !running.closed && !running.error,
                    "stock entrypoint exited before readiness"
                );
                if (!(await exists(env.DSH_LAUNCH_TOKEN_FILE)))
                    return undefined;
                const token = (
                    await readFile(env.DSH_LAUNCH_TOKEN_FILE, "utf8")
                ).trim();
                check(
                    /^[A-Za-z0-9_-]{43}$/.test(token),
                    "malformed wrapper token file"
                );
                secrets.add(token);
                const match = /dsh web: (http:\/\/[^\s]+)/.exec(running.output);
                if (!match) return undefined;
                const url = new URL(match[1]);
                check(
                    url.hostname === "127.0.0.1" && url.pathname === "/",
                    "launch URL was not loopback root"
                );
                check(
                    !running.output.includes(token),
                    "wrapper leaked launch token into output"
                );
                check(
                    ((await stat(env.DSH_LAUNCH_TOKEN_FILE)).mode & 0o777) ===
                        0o600,
                    "launch-token mode is not 0600"
                );
                return { running, token, origin: url.origin };
            },
            60_000,
            "stock entrypoint launch-token handoff"
        );
        return ready;
    };
    stage("stock entrypoint startup and anonymous HTTP/WS rejection");
    const first = await start();
    check(
        (await request(`${first.origin}/`)).status === 401,
        "anonymous index was not rejected"
    );
    check(
        (await request(`${first.origin}/?token=invalid`)).status === 401,
        "invalid launch token was not rejected"
    );
    const anonymousRpc = await request(
        `${first.origin}/api/settings/describe`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                type: "client-request",
                rpcId: "anonymous",
                method: "settings/describe",
                payload: { args: {} }
            })
        }
    );
    check(anonymousRpc.status === 401, "anonymous RPC was not rejected");
    await connect(WebSocket, first.origin, { origin: first.origin }, 401);
    stage("launch-token redirect/cookie exchange and delivered Web assets");
    const exchange = await request(`${first.origin}/?token=${first.token}`);
    check(
        exchange.status === 303 && exchange.headers.location === "./",
        "launch-token exchange did not redirect to clean root"
    );
    check(
        exchange.headers["cache-control"] === "no-store" &&
            exchange.headers["referrer-policy"] === "no-referrer",
        "launch-token exchange lacks privacy headers"
    );
    const setCookie = exchange.headers["set-cookie"]?.find((value) =>
        value.startsWith("dsh-auth-")
    );
    check(
        setCookie &&
            setCookie.includes("HttpOnly") &&
            setCookie.includes("SameSite=Strict") &&
            setCookie.includes("Path=/"),
        "launch-token exchange lacks protected cookie"
    );
    const cookie = setCookie.split(";", 1)[0];
    secrets.add(cookie);
    const duplicate = await request(
        `${first.origin}/?token=${first.token}&token=${first.token}`
    );
    check(
        duplicate.status === 401,
        "duplicate launch-token query was accepted"
    );
    const page = await request(`${first.origin}/`, { headers: { cookie } });
    check(
        page.status === 200 &&
            /text\/html/.test(page.headers["content-type"] || ""),
        "authenticated index unavailable"
    );
    const rawBoot = /globalThis\["__DSH_BOOT__"\] = ([\s\S]*?)<\/script>/.exec(
        page.text
    )?.[1];
    check(rawBoot, "served page lacks injected DSH boot graph");
    const boot = JSON.parse(rawBoot);
    check(
        boot.entries?.some(
            (entry) => entry.id === "@magda/dsh-client-managed-profile"
        ),
        "managed client plugin absent from live boot graph"
    );
    for (const disabled of [
        "ui-settings-models",
        "ui-settings-plugins",
        "ui-plugin-manager"
    ]) {
        check(
            !boot.entries.some(
                (entry) => entry.id === `@deepseek-ai/dsh-client-${disabled}`
            ),
            `disabled managed UI plugin loaded: ${disabled}`
        );
    }
    const assets = new Map();
    for (const match of page.text.matchAll(/<(script|link)\b[^>]*>/gi)) {
        const tag = match[0];
        const value = /\b(?:src|href)=["']([^"']+)["']/i.exec(tag)?.[1];
        if (
            !value ||
            !(
                match[1].toLowerCase() === "script" ||
                /\brel=["']stylesheet["']/i.test(tag)
            )
        )
            continue;
        const decoded = value.replaceAll("&amp;", "&");
        const url = new URL(decoded, `${first.origin}/`);
        check(
            url.origin === first.origin,
            "index referenced a non-loopback asset"
        );
        assets.set(url.href, /\.css(?:\?|$)/.test(url.pathname) ? "css" : "js");
    }
    for (const batch of boot.batches || [])
        assets.set(new URL(batch.url, `${first.origin}/`).href, "js");
    const managed = boot.entries.find(
        (entry) => entry.id === "@magda/dsh-client-managed-profile"
    );
    assets.set(new URL(managed.url, `${first.origin}/`).href, "managed");
    check(
        [...assets.values()].includes("css") &&
            [...assets.values()].includes("js"),
        "index lacks JS/CSS assets"
    );
    for (const [url, kind] of assets) {
        const asset = await request(url, { headers: { cookie } });
        check(
            asset.status === 200 && asset.text.length > 20,
            `served ${kind} asset missing or empty`
        );
        check(
            !/^\s*<!doctype html/i.test(asset.text),
            `${kind} asset fell back to HTML`
        );
        check(
            (kind === "css" ? /text\/css/ : /(?:java|ecma)script/).test(
                asset.headers["content-type"] || ""
            ),
            `${kind} asset MIME type incorrect`
        );
        if (kind === "managed")
            check(
                asset.text.includes("magda-managed-dsh-profile"),
                "managed plugin bundle not actually served"
            );
    }
    await rpc(first.origin, cookie, "settings/describe", {});
    stage("authenticated remote.mux session/follow and local mock LLM turn");
    const created = await rpc(first.origin, cookie, "session/create", {
        request: {}
    });
    check(
        typeof created.sessionId === "string",
        "session/create omitted session id"
    );
    const prompted = await rpc(first.origin, cookie, "session/prompt", {
        request: {
            requestId: randomUUID(),
            sessionId: created.sessionId,
            mode: "queue",
            content: [{ type: "text", text: userMarker }]
        }
    });
    check(prompted.accepted === true, "session prompt was not accepted");
    const hasMarker = (page, marker, type) =>
        page.records?.some(
            (record) =>
                record.type === "event" &&
                record.event?.type === type &&
                JSON.stringify(record.event.data).includes(marker)
        );
    await until(
        async () =>
            hasMarker(
                await history(
                    WebSocket,
                    first.origin,
                    cookie,
                    created.sessionId
                ),
                assistantMarker,
                "assistant/message"
            ),
        30_000,
        "assistant history from local Responses fixture"
    );
    const requestWithTools = llmRequests.find(({ body }) =>
        body.tools?.some((tool) => tool.name === "magda_agent_skill_publish")
    );
    check(
        requestWithTools,
        "managed Agent Skill tools absent from real provider request"
    );
    check(
        requestWithTools.authorization ===
            `Bearer ${payload.llm.authorization}`,
        "provider did not use bootstrap authorization"
    );
    check(
        JSON.stringify(requestWithTools.body).includes(
            "Reusable workflows in MAGDA Agent Workspace"
        ),
        "managed workflow guidance absent from real provider request"
    );
    check(
        requestWithTools.body.model === payload.llm.model,
        "provider did not use bootstrap model"
    );
    // DSH's Office skills and their interpreter tool reach the real provider
    // request by default, without any user, mgd or project skill setup.
    check(
        requestWithTools.body.tools?.some(
            (tool) => tool.name === "load_workspace_dependencies"
        ),
        "load_workspace_dependencies absent from real provider request"
    );
    const catalog = JSON.stringify(
        llmRequests.map(({ body }) => body.input ?? body)
    );
    for (const skill of ["office-docx", "office-pptx", "office-xlsx"])
        check(
            catalog.includes(skill),
            `${skill} absent from the model's skill catalog: ${catalog
                .slice(
                    Math.max(0, catalog.indexOf("python-dependencies") - 400)
                )
                .slice(0, 1200)}`
        );
    const markerFile = path.join(
        root,
        "workspace/image-web-persistence-marker"
    );
    await writeFile(markerFile, userMarker, { mode: 0o600 });
    const createdAt = await readFile("/data/.created-at", "utf8");
    stage("stop/start persistence, cookie survival and old-token rejection");
    await stop(first.running);
    // Cookies are authority-bound: retain the first port across the restart.
    env.DSH_PUBLIC_URL = first.origin;
    const second = await start(new URL(first.origin).port);
    check(second.token !== first.token, "restart reused launch token");
    check(
        (await request(`${second.origin}/?token=${first.token}`)).status ===
            401,
        "old process token remained valid after restart"
    );
    const persisted = await request(`${first.origin}/`, {
        headers: { cookie }
    });
    check(
        persisted.status === 200,
        "browser cookie did not survive same-authority restart"
    );
    check(
        (await readFile(markerFile, "utf8")) === userMarker &&
            (await readFile("/data/.created-at", "utf8")) === createdAt,
        "workspace/creation marker did not persist"
    );
    const persistedHistory = await history(
        WebSocket,
        first.origin,
        cookie,
        created.sessionId
    );
    check(
        hasMarker(persistedHistory, assistantMarker, "assistant/message") &&
            JSON.stringify(persistedHistory).includes(userMarker),
        "session history did not survive restart"
    );
    check(
        ((await stat(path.join(env.DSH_HOME, ".credentials.yaml"))).mode &
            0o777) ===
            0o600,
        "persistent browser credential mode is not 0600"
    );
    for (const running of children)
        for (const token of secrets)
            check(
                !running.output.includes(token),
                "child output leaked an authentication secret"
            );
    console.log(
        `image-web: PASS source=${provenance.sha}; bootstrap, auth, assets, managed plugins, WS, mock LLM, restart/history`
    );
    console.log(
        "image-web: caveat: stock launch token is process-scoped/reusable, not consumed by exchange; no browser rendering or Manager/KAS/ingress validation"
    );
} catch (error) {
    failed = error;
} finally {
    clearTimeout(watchdog);
    process.off("SIGTERM", onSignal);
    process.off("SIGINT", onSignal);
    for (const socket of sockets) socket.terminate();
    for (const running of [...children]) {
        if (failed)
            console.error(
                `image-web: captured child output (redacted):\n${redact(
                    running.output
                )}`
            );
        try {
            await stop(running);
        } catch (error) {
            failed ||= error;
        }
    }
    for (const server of servers) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
    try {
        if (markerOwned) await rm("/data/.created-at", { force: true });
        for (const entry of redirects.reverse()) {
            if (entry.linked) {
                check(
                    (await lstat(entry.file)).isSymbolicLink() &&
                        (await readlink(entry.file)).startsWith(`${root}/`),
                    "refusing to remove changed /data fixture link"
                );
                await rm(entry.file);
            }
            if (entry.previous)
                await mkdir(entry.file, { mode: entry.previous.mode & 0o777 });
        }
        if (root) {
            check(
                root.startsWith("/tmp/magda-image-web-"),
                "refusing unexpected cleanup path"
            );
            await rm(root, { recursive: true, force: true });
        }
    } catch (error) {
        failed ||= error;
    }
}
if (failed) {
    console.error(
        `image-web: FAIL during ${lastStage}: ${redact(
            failed.message || failed
        )}`
    );
    process.exitCode = 1;
}
