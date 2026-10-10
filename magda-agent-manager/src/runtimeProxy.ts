import http, { IncomingMessage, ServerResponse } from "node:http";
import { Duplex } from "node:stream";
import { AgentKubernetesClient } from "./kubernetes.js";
import {
    AgentAuthorizationError,
    AuthOptions,
    authenticateAdminToken
} from "./auth.js";
import { ManagerConfig, SandboxClaim } from "./types.js";

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
    private readonly authOptions: AuthOptions;

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

    private touchActivity(userId: string) {
        const now = Date.now();
        if (now - (this.lastActivityWrite.get(userId) || 0) < 30_000) return;
        this.lastActivityWrite.set(userId, now);
        this.onMeaningfulActivity(userId, new Date(now)).catch((error) =>
            console.error("Could not update Agent Workspace activity", error)
        );
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

    private forwardHttp(
        req: IncomingMessage,
        res: ServerResponse,
        auth: Awaited<ReturnType<RuntimeProxy["authenticate"]>>,
        body: Buffer,
        cookie: string,
        meaningful: boolean,
        attempt = 0
    ) {
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
                            meaningful,
                            1
                        );
                    } catch (error) {
                        if (!res.headersSent) res.writeHead(502);
                        res.end("Agent runtime authentication failed");
                    }
                    return;
                }
                const status = upstreamResponse.statusCode || 502;
                if (meaningful && status >= 200 && status < 300) {
                    this.touchActivity(auth.user.id);
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
            if (!res.writableEnded) upstream.destroy();
        });
        upstream.on("error", (error) => {
            console.error("Agent runtime HTTP proxy error", error);
            if (!res.headersSent) res.writeHead(502);
            res.end("Agent runtime unavailable");
        });
        upstream.end(body);
    }

    async handleHttp(req: IncomingMessage, res: ServerResponse) {
        try {
            const auth = await this.authenticate(req);
            const meaningful = isMeaningfulRuntimeRequest(
                req.method,
                auth.path
            );
            const body = await this.readBody(req);
            const cookie = await this.cookie(auth.target);
            this.forwardHttp(req, res, auth, body, cookie, meaningful);
        } catch (error) {
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
            socket.write(
                responseHeaders(
                    "HTTP/1.1 101 Switching Protocols",
                    response.headers
                )
            );
            if (upstreamHead.length) socket.write(upstreamHead);
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
            // DSH 0.2.1 uses this socket for server-driven Remote streams and
            // protocol ping/pong. User mutations are explicit HTTP RPCs, so an
            // upgrade or frame traffic must not renew workspace retention.
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
    }
}
