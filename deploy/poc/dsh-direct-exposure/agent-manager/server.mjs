// Agent Manager DSH proxy PoC for #3841 (not the production Agent Manager).
//
//   Browser -> Ingress -> magda-gateway (route /api/v0/agent/runtime, websocket: true)
//           -> this proxy (/runtime/...) -> Sandbox Service :3080 -> DSH
//
// Per request (HTTP and WebSocket upgrade alike):
//   1. Require the X-Magda-Session JWT the gateway attaches for an authenticated
//      Magda user (HS256, the cluster's jwt-secret). No user -> 401, never DSH.
//   2. Resolve that user's SandboxClaim (label magda.io/agent-user=<userId>) ->
//      claim.status.sandbox.name -> Service <sandbox>.<ns>.svc:3080.
//   3. Strip /runtime, pin Host to the Magda external authority (the gateway
//      proxies with changeOrigin), keep Origin / Sec-Fetch-* for DSH's fence,
//      drop X-Magda-Session and other Magda headers.
//   4. DSH browser auth, by AUTH_MODE:
//      managed-cookie  stock DSH. The proxy reads the launch token from the
//                      sandbox's token file (written by image/dsh-launch.mjs) via
//                      pods/exec, redeems it server-side (GET /?token= with the
//                      external Host), keeps the authority-bound cookie and
//                      injects it upstream. The browser never sees token/cookie.
//      none            DSH runs with --no-browser-auth (#8528 port).
//      passthrough     forward the browser's own ?token= exchange and rewrite
//                      Set-Cookie (Path=<mount>, Secure). Shows what happens to a
//                      browser-held DSH cookie behind magda-gateway.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { fileURLToPath } from "node:url";

const cfg = {
    port: Number(process.env.PORT || 8080),
    jwtSecret: process.env.JWT_SECRET || "",
    externalAuthority: process.env.EXTERNAL_AUTHORITY || "magda.test:18443",
    mountPath: process.env.MOUNT_PATH || "/api/v0/agent/runtime/",
    pathPrefix: process.env.PATH_PREFIX || "/runtime",
    namespace: process.env.SANDBOX_NAMESPACE || "magda-agent-poc",
    servicePort: Number(process.env.SANDBOX_SERVICE_PORT || 3080),
    authMode: process.env.AUTH_MODE || "managed-cookie",
    claimLabel: process.env.CLAIM_USER_LABEL || "magda.io/agent-user",
    agentContainer: process.env.AGENT_CONTAINER || "agent",
    launchTokenFile: process.env.LAUNCH_TOKEN_FILE || "/run/magda-agent/dsh-launch-token"
};
if (!cfg.jwtSecret) throw new Error("JWT_SECRET is required");
if (!["managed-cookie", "none", "passthrough"].includes(cfg.authMode)) {
    throw new Error(`unknown AUTH_MODE ${cfg.authMode}`);
}

const log = (event, fields = {}) =>
    console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));

// ---------------------------------------------------------------- Magda JWT
function b64urlDecode(s) {
    return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function verifyMagdaSession(token) {
    if (typeof token !== "string") return undefined;
    const parts = token.split(".");
    if (parts.length !== 3) return undefined;
    const [h, p, sig] = parts;
    let header, payload;
    try {
        header = JSON.parse(b64urlDecode(h));
        payload = JSON.parse(b64urlDecode(p));
    } catch {
        return undefined;
    }
    if (header.alg !== "HS256") return undefined;
    const expected = crypto.createHmac("sha256", cfg.jwtSecret).update(`${h}.${p}`).digest();
    const actual = b64urlDecode(sig);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
        return undefined;
    }
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return undefined;
    return typeof payload.userId === "string" ? payload : undefined;
}

// ----------------------------------------------------------- Kubernetes API
const SA_DIR = "/var/run/secrets/kubernetes.io/serviceaccount";
const kubeAgent = fs.existsSync(`${SA_DIR}/ca.crt`)
    ? new https.Agent({ ca: fs.readFileSync(`${SA_DIR}/ca.crt`), keepAlive: true })
    : undefined;

function kube(path) {
    const token = fs.readFileSync(`${SA_DIR}/token`, "utf8");
    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                host: process.env.KUBERNETES_SERVICE_HOST,
                port: process.env.KUBERNETES_SERVICE_PORT,
                path,
                agent: kubeAgent,
                headers: { authorization: `Bearer ${token}` }
            },
            (res) => {
                let body = "";
                res.setEncoding("utf8");
                res.on("data", (d) => (body += d));
                res.on("end", () =>
                    res.statusCode === 200
                        ? resolve(body)
                        : reject(new Error(`kube ${path}: ${res.statusCode} ${body.slice(0, 200)}`))
                );
            }
        );
        req.on("error", reject);
        req.end();
    });
}

// userId -> { sandbox, host, expires }
const targetCache = new Map();

async function resolveSandbox(userId) {
    const cached = targetCache.get(userId);
    if (cached && cached.expires > Date.now()) return cached;
    const selector = encodeURIComponent(`${cfg.claimLabel}=${userId}`);
    const list = JSON.parse(
        await kube(
            `/apis/extensions.agents.x-k8s.io/v1beta1/namespaces/${cfg.namespace}/sandboxclaims?labelSelector=${selector}`
        )
    );
    const claim = list.items.find((c) => c.status?.sandbox?.name);
    if (!claim) return undefined;
    const sandbox = claim.status.sandbox.name;
    const target = {
        claim: claim.metadata.name,
        sandbox,
        host: `${sandbox}.${cfg.namespace}.svc.cluster.local`,
        expires: Date.now() + 10_000
    };
    targetCache.set(userId, target);
    return target;
}

// ------------------------------------------------ managed DSH browser cookie
// sandbox name -> "dsh-auth-<hash>=<value>"
const cookieJar = new Map();

// Run a command in a Pod over the Kubernetes exec WebSocket protocol
// (v5/v4.channel.k8s.io: binary frames, first byte = channel; 1 stdout,
// 2 stderr, 3 final status JSON). Needs RBAC `create pods/exec`. Returns stdout.
function kubeExec(pod, command, timeoutMs = 10_000) {
    const query = new URLSearchParams({ container: cfg.agentContainer, stdout: "true", stderr: "true" });
    for (const arg of command) query.append("command", arg);
    return new Promise((resolve, reject) => {
        const req = https.request({
            host: process.env.KUBERNETES_SERVICE_HOST,
            port: process.env.KUBERNETES_SERVICE_PORT,
            path: `/api/v1/namespaces/${cfg.namespace}/pods/${pod}/exec?${query}`,
            ca: fs.readFileSync(`${SA_DIR}/ca.crt`),
            headers: {
                authorization: `Bearer ${fs.readFileSync(`${SA_DIR}/token`, "utf8")}`,
                connection: "Upgrade",
                upgrade: "websocket",
                "sec-websocket-version": "13",
                "sec-websocket-key": crypto.randomBytes(16).toString("base64"),
                "sec-websocket-protocol": "v5.channel.k8s.io, v4.channel.k8s.io"
            }
        });
        req.setTimeout(timeoutMs, () => req.destroy(new Error(`exec ${pod}: timeout`)));
        req.on("error", reject);
        req.on("response", (res) => {
            let body = "";
            res.on("data", (d) => (body += d));
            res.on("end", () => reject(new Error(`exec ${pod}: HTTP ${res.statusCode} ${body.slice(0, 200)}`)));
        });
        req.on("upgrade", (res, socket, head) => {
            const out = { 1: [], 2: [], 3: [] };
            let buf = head;
            let channel;
            const timer = setTimeout(() => socket.destroy(new Error(`exec ${pod}: timeout`)), timeoutMs);
            socket.on("data", (d) => {
                buf = Buffer.concat([buf, d]);
                for (;;) {
                    if (buf.length < 2) return;
                    const opcode = buf[0] & 0x0f;
                    let len = buf[1] & 0x7f;
                    let off = 2;
                    if (len === 126) {
                        if (buf.length < 4) return;
                        len = buf.readUInt16BE(2);
                        off = 4;
                    } else if (len === 127) {
                        if (buf.length < 10) return;
                        len = Number(buf.readBigUInt64BE(2));
                        off = 10;
                    }
                    if (buf.length < off + len) return;
                    const payload = buf.subarray(off, off + len);
                    buf = buf.subarray(off + len);
                    if (opcode === 0x2 && payload.length) {
                        channel = payload[0];
                        out[channel]?.push(payload.subarray(1));
                    } else if (opcode === 0x0) {
                        out[channel]?.push(payload); // continuation of the last frame
                    } else if (opcode === 0x8) {
                        socket.end();
                    }
                }
            });
            socket.on("error", (e) => {
                clearTimeout(timer);
                reject(e);
            });
            socket.on("close", () => {
                clearTimeout(timer);
                const text = (c) => Buffer.concat(out[c]).toString("utf8");
                let status;
                try {
                    status = JSON.parse(text(3) || "{}");
                } catch {}
                if (status?.status !== "Success") {
                    return reject(
                        new Error(`exec ${pod}: ${status?.message || "no status"} ${text(2).slice(0, 200)}`)
                    );
                }
                resolve(text(1));
            });
        });
        req.end();
    });
}

async function readLaunchToken(sandbox) {
    // The Sandbox Pod is named after the Sandbox (Agent Sandbox v1.0.4), also
    // for a Sandbox adopted from a warm pool (tests/warmpool-adoption.mjs).
    const token = (await kubeExec(sandbox, ["cat", cfg.launchTokenFile])).trim();
    if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error(`no DSH launch token in ${sandbox}`);
    return token;
}

function exchangeLaunchToken(target, token) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                host: target.host,
                port: cfg.servicePort,
                path: `/?token=${encodeURIComponent(token)}`,
                headers: { host: cfg.externalAuthority }
            },
            (res) => {
                res.resume();
                const setCookie = res.headers["set-cookie"]?.[0];
                if (res.statusCode !== 303 || !setCookie) {
                    return reject(new Error(`token exchange: HTTP ${res.statusCode}`));
                }
                resolve(setCookie.split(";")[0]);
            }
        );
        req.on("error", reject);
        req.end();
    });
}

async function managedCookie(target, refresh = false) {
    if (!refresh && cookieJar.has(target.sandbox)) return cookieJar.get(target.sandbox);
    const cookie = await exchangeLaunchToken(target, await readLaunchToken(target.sandbox));
    cookieJar.set(target.sandbox, cookie);
    log("dsh-cookie-acquired", { sandbox: target.sandbox, refresh });
    return cookie;
}

// ------------------------------------------------------------ request shape
const DROP_REQUEST_HEADERS = new Set([
    "host",
    "cookie",
    "x-magda-session",
    "x-magda-tenant-id",
    "x-magda-api-key",
    "x-magda-api-key-id",
    "authorization",
    "proxy-authorization"
]);

function stripPrefix(url) {
    const prefix = cfg.pathPrefix;
    if (url === prefix) return "/";
    if (url.startsWith(`${prefix}/`)) return url.slice(prefix.length);
    if (url.startsWith(`${prefix}?`)) return `/${url.slice(prefix.length)}`;
    return undefined;
}

function upstreamHeaders(req, cookie) {
    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) {
        if (!DROP_REQUEST_HEADERS.has(name)) headers[name] = value;
    }
    // magda-gateway proxies with changeOrigin, so restore the browser-facing
    // authority from configuration rather than trusting a forwarded header.
    headers.host = cfg.externalAuthority;
    if (cfg.authMode === "managed-cookie" && cookie) headers.cookie = cookie;
    if (cfg.authMode === "passthrough" && req.headers.cookie) headers.cookie = req.headers.cookie;
    return headers;
}

function rewriteSetCookie(values) {
    if (!values) return undefined;
    if (cfg.authMode !== "passthrough") return undefined; // never leak DSH cookies
    return values.map((v) => {
        let out = v.replace(/;\s*Path=\/(?=;|$)/i, `; Path=${cfg.mountPath}`);
        if (!/;\s*Secure/i.test(out)) out += "; Secure";
        return out;
    });
}

async function authenticate(req) {
    const session = verifyMagdaSession(req.headers["x-magda-session"]);
    if (!session) return { status: 401, message: "Magda authentication required" };
    const path = stripPrefix(req.url);
    if (!path) return { status: 404, message: "not found" };
    let target;
    try {
        target = await resolveSandbox(session.userId);
    } catch (e) {
        log("resolve-error", { userId: session.userId, error: String(e) });
        return { status: 503, message: "agent sandbox lookup failed" };
    }
    if (!target) return { status: 404, message: "no agent sandbox for this user" };
    return { session, path, target };
}

// ---------------------------------------------------------------- HTTP path
function forwardHttp(req, res, auth, body, cookie, attempt) {
    const upstream = http.request(
        {
            host: auth.target.host,
            port: cfg.servicePort,
            method: req.method,
            path: auth.path,
            headers: upstreamHeaders(req, cookie)
        },
        async (upRes) => {
            if (
                upRes.statusCode === 401 &&
                cfg.authMode === "managed-cookie" &&
                attempt === 0
            ) {
                // New Sandbox volume (new signing secret) or expired cookie: redeem
                // the current launch token once and retry.
                upRes.resume();
                try {
                    const fresh = await managedCookie(auth.target, true);
                    return forwardHttp(req, res, auth, body, fresh, 1);
                } catch (e) {
                    log("dsh-cookie-error", { sandbox: auth.target.sandbox, error: String(e) });
                }
            }
            const headers = { ...upRes.headers };
            const setCookie = rewriteSetCookie(headers["set-cookie"]);
            if (setCookie) headers["set-cookie"] = setCookie;
            else delete headers["set-cookie"];
            res.writeHead(upRes.statusCode, headers);
            upRes.pipe(res);
            log("http", {
                user: auth.session.userId,
                sandbox: auth.target.sandbox,
                method: req.method,
                path: auth.path.split("?")[0],
                status: upRes.statusCode
            });
        }
    );
    upstream.on("error", (e) => {
        targetCache.delete(auth.session.userId);
        log("http-upstream-error", { sandbox: auth.target.sandbox, error: String(e) });
        if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
        res.end("agent sandbox unavailable");
    });
    upstream.end(body);
}

const server = http.createServer(async (req, res) => {
    if (req.url === "/healthz") {
        res.writeHead(200);
        return res.end("ok");
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const auth = await authenticate(req);
    if (!auth.target) {
        log("http-rejected", { status: auth.status, path: req.url.split("?")[0] });
        res.writeHead(auth.status, { "content-type": "text/plain" });
        return res.end(auth.message);
    }
    let cookie;
    if (cfg.authMode === "managed-cookie") {
        try {
            cookie = await managedCookie(auth.target);
        } catch (e) {
            log("dsh-cookie-error", { sandbox: auth.target.sandbox, error: String(e) });
        }
    }
    forwardHttp(req, res, auth, body, cookie, 0);
});
server.requestTimeout = 0;

// ----------------------------------------------------------- WebSocket path
const upgraded = new Set();

function writeSocketResponse(socket, status, message) {
    socket.end(
        `HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nConnection: close\r\n` +
            `Content-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`
    );
}

function rawHeaders(statusLine, headers) {
    const lines = [statusLine];
    for (const [k, v] of Object.entries(headers)) {
        for (const item of Array.isArray(v) ? v : [v]) lines.push(`${k}: ${item}`);
    }
    return lines.join("\r\n") + "\r\n\r\n";
}

function connectWebSocket(req, socket, head, auth, cookie, attempt) {
    const started = Date.now();
    const upstream = http.request({
        host: auth.target.host,
        port: cfg.servicePort,
        method: "GET",
        path: auth.path,
        headers: upstreamHeaders(req, cookie)
    });
    upstream.on("upgrade", (upRes, upSocket, upHead) => {
        socket.write(rawHeaders("HTTP/1.1 101 Switching Protocols", upRes.headers));
        if (upHead?.length) socket.write(upHead);
        if (head?.length) upSocket.write(head);
        upSocket.pipe(socket).pipe(upSocket);
        upgraded.add(socket);
        const pair = [socket, upSocket];
        let closed = false;
        const close = (who) => {
            if (closed) return;
            closed = true;
            upgraded.delete(socket);
            pair.forEach((s) => s.destroy());
            log("ws-close", {
                user: auth.session.userId,
                sandbox: auth.target.sandbox,
                closedBy: who,
                seconds: Math.round((Date.now() - started) / 1000),
                bytesFromDsh: upSocket.bytesRead,
                bytesFromBrowser: socket.bytesRead
            });
        };
        socket.once("close", () => close("client"));
        upSocket.once("close", () => close("dsh"));
        socket.on("error", () => close("client-error"));
        upSocket.on("error", () => close("dsh-error"));
        log("ws-open", {
            user: auth.session.userId,
            sandbox: auth.target.sandbox,
            path: auth.path,
            origin: req.headers.origin,
            secWebSocketExtensions: upRes.headers["sec-websocket-extensions"]
        });
    });
    upstream.on("response", async (upRes) => {
        upRes.resume();
        if (upRes.statusCode === 401 && cfg.authMode === "managed-cookie" && attempt === 0) {
            try {
                const fresh = await managedCookie(auth.target, true);
                return connectWebSocket(req, socket, head, auth, fresh, 1);
            } catch (e) {
                log("dsh-cookie-error", { sandbox: auth.target.sandbox, error: String(e) });
            }
        }
        log("ws-rejected-by-dsh", { sandbox: auth.target.sandbox, status: upRes.statusCode });
        writeSocketResponse(socket, upRes.statusCode, "rejected by agent runtime");
    });
    upstream.on("error", (e) => {
        targetCache.delete(auth.session.userId);
        log("ws-upstream-error", { sandbox: auth.target.sandbox, error: String(e) });
        writeSocketResponse(socket, 502, "agent sandbox unavailable");
    });
    upstream.end();
}

server.on("upgrade", async (req, socket, head) => {
    socket.on("error", () => socket.destroy());
    // Header-level evidence of what reached this hop (no secret values).
    log("ws-handshake", {
        path: req.url.split("?")[0],
        upgrade: req.headers.upgrade,
        connection: req.headers.connection,
        host: req.headers.host,
        origin: req.headers.origin,
        hasMagdaSession: !!req.headers["x-magda-session"],
        hasCookie: !!req.headers.cookie,
        xForwardedProto: req.headers["x-forwarded-proto"]
    });
    const auth = await authenticate(req);
    if (!auth.target) return writeSocketResponse(socket, auth.status, auth.message);
    let cookie;
    if (cfg.authMode === "managed-cookie") {
        try {
            cookie = await managedCookie(auth.target);
        } catch (e) {
            log("dsh-cookie-error", { sandbox: auth.target.sandbox, error: String(e) });
        }
    }
    connectWebSocket(req, socket, head, auth, cookie, 0);
});

// Exported for tests/am-upstream-headers.mjs, which imports this module
// without starting the server.
export { DROP_REQUEST_HEADERS, upstreamHeaders, verifyMagdaSession };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    server.listen(cfg.port, () =>
        log("listening", { port: cfg.port, authMode: cfg.authMode, externalAuthority: cfg.externalAuthority })
    );

    process.on("SIGTERM", () => {
        log("sigterm", { upgradedSockets: upgraded.size });
        server.close();
        upgraded.forEach((s) => s.destroy());
        setTimeout(() => process.exit(0), 500).unref();
    });
}
