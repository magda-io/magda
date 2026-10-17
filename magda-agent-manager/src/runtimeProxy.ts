import http, { IncomingMessage, ServerResponse } from "node:http";
import { Duplex } from "node:stream";
import { AgentKubernetesClient } from "./kubernetes.js";
import {
    AgentAuthorizationError,
    AuthOptions,
    authenticateAdminToken
} from "./auth.js";
import { ManagerConfig, SandboxClaim } from "./types.js";
import type { ActivitySnapshotToken } from "./webSocketActivity.js";
import {
    DshSessionStatusFrameParser,
    ForegroundActivityTracker,
    runningSessionIds
} from "./webSocketActivity.js";

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

interface RuntimeTarget {
    sandbox: string;
    host: string;
}

const MEANINGFUL_RPC_OPERATIONS = new Set([
    "$events/result",
    "attachment",
    "cancel",
    "close",
    "create",
    "delete",
    "fork",
    "pause",
    "prompt",
    "remove",
    "rename",
    "resume",
    "selectModel",
    "update",
    "updateQueue",
    "write"
]);

export function isMeaningfulRuntimeRequest(
    method: string | undefined,
    path: string
) {
    if (
        !["POST", "PUT", "PATCH", "DELETE"].includes(
            (method || "GET").toUpperCase()
        )
    ) {
        return false;
    }
    const pathname = new URL(path, "http://runtime.invalid").pathname;
    const endpoint = pathname.startsWith("/api/")
        ? pathname.slice("/api/".length)
        : "";
    const operation =
        endpoint === "$events/result"
            ? endpoint
            : endpoint.split("/").at(-1) || "";
    return MEANINGFUL_RPC_OPERATIONS.has(operation);
}

export function upstreamHeaders(
    headers: IncomingMessage["headers"],
    externalAuthority: string,
    cookie?: string
): http.OutgoingHttpHeaders {
    const result: http.OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(headers)) {
        if (!DROP_REQUEST_HEADERS.has(name.toLowerCase())) result[name] = value;
    }
    result.host = externalAuthority;
    if (cookie) result.cookie = cookie;
    return result;
}

function socketResponse(socket: Duplex, status: number, message: string) {
    socket.end(
        `HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\n` +
            "Connection: close\r\n" +
            "Content-Type: text/plain\r\n" +
            `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`
    );
}

function responseHeaders(
    statusLine: string,
    headers: IncomingMessage["headers"]
) {
    const lines = [statusLine];
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === "set-cookie" || value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) {
            lines.push(`${key}: ${item}`);
        }
    }
    return `${lines.join("\r\n")}\r\n\r\n`;
}

export class RuntimeProxy {
    private readonly cookieJar = new Map<string, string>();
    private readonly cookieExchanges = new Map<string, Promise<string>>();
    private readonly sockets = new Map<string, Set<Duplex>>();
    private readonly lastActivityWrite = new Map<string, number>();
    private readonly pendingActivityWrite = new Map<string, number>();
    private readonly activityWrites = new Map<string, Promise<void>>();
    private readonly authOptions: AuthOptions;
    private readonly foregroundActivity: ForegroundActivityTracker;

    constructor(
        private readonly config: ManagerConfig,
        private readonly kubernetes: AgentKubernetesClient,
        private readonly onMeaningfulActivity: (
            userId: string,
            activityTime: Date
        ) => Promise<void> = async () => undefined
    ) {
        this.authOptions = {
            jwtSecret: config.jwtSecret,
            authApiUrl: config.authApiUrl
        };
        this.foregroundActivity = new ForegroundActivityTracker(
            onMeaningfulActivity,
            Math.max(
                1_000,
                Math.min(60_000, (config.idleSuspendSeconds * 1000) / 3)
            )
        );
    }

    private stripRuntimePrefix(url = "/"): string | undefined {
        const prefix = this.config.runtimePrefix.replace(/\/$/, "");
        if (url === prefix) return "/";
        if (url.startsWith(`${prefix}/`)) return url.slice(prefix.length);
        if (url.startsWith(`${prefix}?`)) return `/${url.slice(prefix.length)}`;
        return undefined;
    }

    private async targetForUser(userId: string): Promise<RuntimeTarget> {
        const status = await this.kubernetes.status(userId);
        if (status.state !== "READY") {
            throw new AgentAuthorizationError(
                status.state === "ABSENT"
                    ? "No Agent Workspace exists for this user"
                    : `Agent Workspace is not ready (${status.state})`,
                status.state === "ABSENT" ? 404 : 409
            );
        }
        const claim = (await this.kubernetes.getClaim(userId)) as SandboxClaim;
        const sandbox = claim.status?.sandbox?.name;
        if (!sandbox) {
            throw new AgentAuthorizationError(
                "Agent Workspace runtime is unavailable",
                503
            );
        }
        const sandboxResource = await this.kubernetes.getSandbox(sandbox);
        const host =
            sandboxResource?.status?.serviceFQDN ||
            claim.status?.sandbox?.serviceFQDN ||
            `${sandbox}.${this.config.namespace}.svc.cluster.local`;
        return { sandbox, host };
    }

    private async authenticate(req: IncomingMessage) {
        const path = this.stripRuntimePrefix(req.url);
        if (!path) throw new AgentAuthorizationError("Not found", 404);
        const token = req.headers["x-magda-session"];
        const user = await authenticateAdminToken(
            Array.isArray(token) ? token[0] : token,
            this.authOptions
        );
        return { user, path, target: await this.targetForUser(user.id) };
    }

    private exchangeToken(
        target: RuntimeTarget,
        token: string
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const request = http.request(
                {
                    host: target.host,
                    port: this.config.sandboxPort,
                    path: `/?token=${encodeURIComponent(token)}`,
                    headers: { host: this.config.externalAuthority }
                },
                (response) => {
                    response.resume();
                    const setCookie = response.headers["set-cookie"]?.[0];
                    if (response.statusCode !== 303 || !setCookie) {
                        reject(
                            new Error(
                                `DSH launch-token exchange returned HTTP ${response.statusCode}`
                            )
                        );
                        return;
                    }
                    resolve(setCookie.split(";", 1)[0]);
                }
            );
            request.setTimeout(10_000, () =>
                request.destroy(new Error("DSH token exchange timed out"))
            );
            request.on("error", reject);
            request.end();
        });
    }

    private async cookie(target: RuntimeTarget, refresh = false) {
        if (!refresh) {
            const cached = this.cookieJar.get(target.sandbox);
            if (cached) return cached;
        } else {
            this.cookieJar.delete(target.sandbox);
        }
        const inFlight = this.cookieExchanges.get(target.sandbox);
        if (inFlight) return inFlight;
        const exchange = (async () => {
            const token = await this.kubernetes.readLaunchToken(target.sandbox);
            const cookie = await this.exchangeToken(target, token);
            this.cookieJar.set(target.sandbox, cookie);
            return cookie;
        })().finally(() => this.cookieExchanges.delete(target.sandbox));
        this.cookieExchanges.set(target.sandbox, exchange);
        return exchange;
    }

    private touchActivity(userId: string): Promise<void> {
        const now = Date.now();
        const existing = this.activityWrites.get(userId);
        if (
            !existing &&
            !this.pendingActivityWrite.has(userId) &&
            now - (this.lastActivityWrite.get(userId) || 0) < 30_000
        ) {
            return Promise.resolve();
        }
        this.pendingActivityWrite.set(
            userId,
            Math.max(this.pendingActivityWrite.get(userId) || 0, now)
        );
        if (existing) return existing;

        let write: Promise<void>;
        write = (async () => {
            while (this.pendingActivityWrite.has(userId)) {
                const activityTime = this.pendingActivityWrite.get(userId)!;
                this.pendingActivityWrite.delete(userId);
                try {
                    await this.onMeaningfulActivity(
                        userId,
                        new Date(activityTime)
                    );
                    this.lastActivityWrite.set(
                        userId,
                        Math.max(
                            this.lastActivityWrite.get(userId) || 0,
                            activityTime
                        )
                    );
                } catch (error) {
                    // Preserve the newest unpersisted activity. The next
                    // qualifying request starts a fresh bounded attempt. Do not
                    // send this request to DSH without its durable lease.
                    this.pendingActivityWrite.set(
                        userId,
                        Math.max(
                            this.pendingActivityWrite.get(userId) || 0,
                            activityTime
                        )
                    );
                    console.error(
                        "Could not update Agent Workspace activity",
                        error
                    );
                    throw error;
                }
            }
        })().finally(() => {
            if (this.activityWrites.get(userId) === write) {
                this.activityWrites.delete(userId);
            }
        });
        this.activityWrites.set(userId, write);
        return write;
    }

    private async readBody(req: IncomingMessage): Promise<Buffer> {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
            const value = Buffer.from(chunk);
            size += value.length;
            if (size > this.config.runtimeMaxBodyBytes) {
                throw new AgentAuthorizationError(
                    "Agent runtime request body is too large",
                    413
                );
            }
            chunks.push(value);
        }
        return Buffer.concat(chunks);
    }

    private observeSessionList(
        userId: string,
        path: string,
        response: IncomingMessage,
        snapshotToken: ActivitySnapshotToken | undefined
    ) {
        if (path.split("?", 1)[0] !== "/api/session/list") return;
        const chunks: Buffer[] = [];
        let size = 0;
        let settled = false;
        const cancel = () => {
            if (settled) return;
            settled = true;
            this.foregroundActivity.cancelSnapshot(userId, snapshotToken);
        };
        response.on("data", (chunk: Buffer) => {
            if (settled) return;
            size += chunk.length;
            if (size > 1024 * 1024) {
                chunks.length = 0;
                cancel();
                return;
            }
            chunks.push(Buffer.from(chunk));
        });
        response.once("end", () => {
            if (settled) return;
            try {
                const value = JSON.parse(
                    Buffer.concat(chunks).toString("utf8")
                );
                this.foregroundActivity.replaceSnapshot(
                    userId,
                    runningSessionIds(value),
                    snapshotToken
                );
                settled = true;
            } catch {
                // DSH owns response validation; observation must not affect it.
                cancel();
            }
        });
        response.once("aborted", cancel);
        response.once("error", cancel);
        response.once("close", cancel);
    }

    private forwardHttp(
        req: IncomingMessage,
        res: ServerResponse,
        auth: Awaited<ReturnType<RuntimeProxy["authenticate"]>>,
        body: Buffer,
        cookie: string,
        snapshotToken: ActivitySnapshotToken | undefined,
        attempt = 0
    ) {
        const cancelSnapshot = () =>
            this.foregroundActivity.cancelSnapshot(auth.user.id, snapshotToken);
        const upstream = http.request(
            {
                host: auth.target.host,
                port: this.config.sandboxPort,
                method: req.method,
                path: auth.path,
                headers: upstreamHeaders(
                    req.headers,
                    this.config.externalAuthority,
                    cookie
                )
            },
            async (upstreamResponse) => {
                if (upstreamResponse.statusCode === 401 && attempt === 0) {
                    upstreamResponse.resume();
                    try {
                        const freshCookie = await this.cookie(
                            auth.target,
                            true
                        );
                        this.forwardHttp(
                            req,
                            res,
                            auth,
                            body,
                            freshCookie,
                            snapshotToken,
                            1
                        );
                    } catch (error) {
                        cancelSnapshot();
                        if (!res.headersSent) res.writeHead(502);
                        res.end("Agent runtime authentication failed");
                    }
                    return;
                }
                const status = upstreamResponse.statusCode || 502;
                if (status >= 200 && status < 300) {
                    this.observeSessionList(
                        auth.user.id,
                        auth.path,
                        upstreamResponse,
                        snapshotToken
                    );
                } else {
                    cancelSnapshot();
                }
                const headers = { ...upstreamResponse.headers };
                delete headers["set-cookie"];
                res.writeHead(status, headers);
                upstreamResponse.pipe(res);
            }
        );
        upstream.setTimeout(120_000, () =>
            upstream.destroy(new Error("Agent runtime request timed out"))
        );
        res.once("close", () => {
            if (!res.writableEnded) {
                cancelSnapshot();
                upstream.destroy();
            }
        });
        upstream.on("error", (error) => {
            cancelSnapshot();
            console.error("Agent runtime HTTP proxy error", error);
            if (!res.headersSent) res.writeHead(502);
            res.end("Agent runtime unavailable");
        });
        upstream.end(body);
    }

    async handleHttp(req: IncomingMessage, res: ServerResponse) {
        let snapshotUserId: string | undefined;
        let snapshotToken: ActivitySnapshotToken | undefined;
        try {
            const auth = await this.authenticate(req);
            const meaningful = isMeaningfulRuntimeRequest(
                req.method,
                auth.path
            );
            snapshotUserId = auth.user.id;
            snapshotToken =
                auth.path.split("?", 1)[0] === "/api/session/list"
                    ? this.foregroundActivity.beginSnapshot(auth.user.id)
                    : undefined;
            const body = await this.readBody(req);
            // Persist the lease before DSH begins work. Otherwise KAS can
            // enforce the previous shutdownTime while a near-expiry mutation is
            // still in flight. If persistence fails, reject without executing.
            if (meaningful) await this.touchActivity(auth.user.id);
            const cookie = await this.cookie(auth.target);
            this.forwardHttp(req, res, auth, body, cookie, snapshotToken);
        } catch (error) {
            if (snapshotUserId) {
                this.foregroundActivity.cancelSnapshot(
                    snapshotUserId,
                    snapshotToken
                );
            }
            const proxyError = error as AgentAuthorizationError;
            const status = proxyError.status || 502;
            res.writeHead(status, { "content-type": "application/json" });
            res.end(JSON.stringify({ message: proxyError.message }));
        }
    }

    private trackSocket(sandbox: string, ...pair: Duplex[]) {
        const set = this.sockets.get(sandbox) || new Set<Duplex>();
        pair.forEach((socket) => set.add(socket));
        this.sockets.set(sandbox, set);
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            pair.forEach((socket) => {
                set.delete(socket);
                socket.destroy();
            });
            if (!set.size) this.sockets.delete(sandbox);
        };
        pair.forEach((socket) => {
            socket.once("close", close);
            socket.once("error", close);
        });
    }

    private connectWebSocket(
        req: IncomingMessage,
        socket: Duplex,
        head: Buffer,
        auth: Awaited<ReturnType<RuntimeProxy["authenticate"]>>,
        cookie: string,
        attempt = 0
    ) {
        const upstream = http.request({
            host: auth.target.host,
            port: this.config.sandboxPort,
            method: "GET",
            path: auth.path,
            headers: upstreamHeaders(
                req.headers,
                this.config.externalAuthority,
                cookie
            )
        });
        upstream.on("upgrade", (response, upstreamSocket, upstreamHead) => {
            const activityOwner = Symbol("dsh-websocket");
            this.foregroundActivity.connect(auth.user.id, activityOwner);
            const parser = new DshSessionStatusFrameParser(
                ({ agentId, running }) =>
                    this.foregroundActivity.status(
                        auth.user.id,
                        agentId,
                        running,
                        activityOwner
                    )
            );
            upstreamSocket.on("data", (chunk: Buffer) => parser.push(chunk));
            upstreamSocket.once("close", () =>
                this.foregroundActivity.disconnect(auth.user.id, activityOwner)
            );
            socket.write(
                responseHeaders(
                    "HTTP/1.1 101 Switching Protocols",
                    response.headers
                )
            );
            if (upstreamHead.length) {
                parser.push(upstreamHead);
                socket.write(upstreamHead);
            }
            if (head.length) upstreamSocket.write(head);
            upstreamSocket.pipe(socket).pipe(upstreamSocket);
            this.trackSocket(auth.target.sandbox, socket, upstreamSocket);
        });
        upstream.on("response", async (response) => {
            response.resume();
            if (response.statusCode === 401 && attempt === 0) {
                try {
                    this.connectWebSocket(
                        req,
                        socket,
                        head,
                        auth,
                        await this.cookie(auth.target, true),
                        1
                    );
                    return;
                } catch {
                    // Fall through to the stable proxy error below.
                }
            }
            socketResponse(
                socket,
                response.statusCode || 502,
                "Agent runtime rejected the WebSocket connection"
            );
        });
        upstream.on("error", () =>
            socketResponse(socket, 502, "Agent runtime unavailable")
        );
        upstream.end();
    }

    async handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
        socket.on("error", () => socket.destroy());
        try {
            const auth = await this.authenticate(req);
            // Opening the DSH Remote stream and its protocol-level ping/pong do
            // not count as activity. The proxy observes only the explicit
            // api-session/status running signal to protect foreground turns.
            this.connectWebSocket(
                req,
                socket,
                head,
                auth,
                await this.cookie(auth.target)
            );
        } catch (error) {
            const proxyError = error as AgentAuthorizationError;
            socketResponse(
                socket,
                proxyError.status || 502,
                proxyError.message
            );
        }
    }

    hasSandboxSockets(sandbox: string) {
        return (this.sockets.get(sandbox)?.size || 0) > 0;
    }

    async closeUserSockets(userId: string) {
        const claim = await this.kubernetes.getClaim(userId);
        const sandbox = claim?.status?.sandbox?.name;
        if (sandbox) this.closeSandboxSockets(sandbox);
    }

    closeSandboxSockets(sandbox: string) {
        this.cookieJar.delete(sandbox);
        this.cookieExchanges.delete(sandbox);
        this.sockets.get(sandbox)?.forEach((socket) => socket.destroy());
        this.sockets.delete(sandbox);
    }

    closeAll() {
        this.sockets.forEach((sockets) =>
            sockets.forEach((socket) => socket.destroy())
        );
        this.sockets.clear();
        this.cookieJar.clear();
        this.cookieExchanges.clear();
        this.lastActivityWrite.clear();
        this.pendingActivityWrite.clear();
        this.foregroundActivity.close();
    }
}
