import { IncomingMessage, ServerResponse, STATUS_CODES } from "http";
import { Socket } from "net";
import { Duplex } from "stream";

const UPGRADE_CONTEXT = Symbol("magdaWebSocketUpgrade");

export interface WebSocketUpgradeContext {
    socket: Duplex;
    head: Buffer;
    // set once a route handler has taken ownership of the socket
    claimed: boolean;
}

type UpgradeRequest = IncomingMessage & {
    [UPGRADE_CONTEXT]?: WebSocketUpgradeContext;
};

/**
 * Returns the upgrade context when `req` arrived through the server `upgrade` event
 * (i.e. it is a WebSocket handshake dispatched by `WebSocketUpgradeHandler`).
 * Ordinary HTTP requests return `undefined`, whatever headers they carry.
 */
export function getWebSocketUpgradeContext(
    req: IncomingMessage
): WebSocketUpgradeContext | undefined {
    return (req as UpgradeRequest)[UPGRADE_CONTEXT];
}

/**
 * Take ownership of the upgrade socket so the placeholder response no longer writes to it.
 * Call this before handing the socket to `proxy.ws()`.
 */
export function claimWebSocketUpgrade(
    req: IncomingMessage,
    res: ServerResponse
): WebSocketUpgradeContext {
    const context = getWebSocketUpgradeContext(req);
    if (!context) {
        throw new Error("Not a WebSocket upgrade request");
    }
    context.claimed = true;
    res.detachSocket(context.socket as Socket);
    return context;
}

function isWebSocketHandshake(req: IncomingMessage) {
    return (
        req.method === "GET" &&
        typeof req.headers.upgrade === "string" &&
        req.headers.upgrade.toLowerCase() === "websocket"
    );
}

// how long a closing handshake socket may take to flush & close before it is destroyed
const SOCKET_CLOSE_TIMEOUT_MS = 5000;

/**
 * Close a socket without discarding data that is still queued for the client.
 * `end()` flushes pending writes before closing, whereas destroying the socket straight away
 * may drop them (and closing with unread request bytes makes the TCP stack send a reset).
 * The socket is destroyed if it hasn't closed within a short timeout.
 */
export function closeSocketGracefully(socket: Duplex, data?: string) {
    if (!socket.writable) {
        socket.destroy();
        return;
    }
    socket.end(data);
    // read & discard anything the client still sends so the socket can close normally
    socket.resume();
    const timer = setTimeout(() => socket.destroy(), SOCKET_CLOSE_TIMEOUT_MS);
    timer.unref();
    socket.once("close", () => clearTimeout(timer));
}

/**
 * Answer a WebSocket handshake that hasn't been upgraded with a plain HTTP response, then close
 * the socket. Must not be used once the connection has been upgraded.
 */
export function rejectWebSocketHandshake(
    socket: Duplex,
    statusCode: number,
    message: string = STATUS_CODES[statusCode]
) {
    closeSocketGracefully(
        socket,
        `HTTP/1.1 ${statusCode} ${STATUS_CODES[statusCode]}\r\n` +
            "Connection: close\r\nContent-Type: text/plain\r\n" +
            `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n` +
            message
    );
}

/**
 * Dispatches HTTP `upgrade` requests through the normal Express app, so WebSocket handshakes
 * pass the same middleware chain (session / API key authentication, access control, tenant
 * handling, route matching) as ordinary requests.
 *
 * The Express app receives a placeholder `ServerResponse` bound to the raw socket: any
 * middleware that answers before a route claims the socket (401/403/404, redirects, errors)
 * is written to the client as a normal HTTP response, which a browser reports as a failed
 * WebSocket handshake. Only routes configured with `websocket: true` claim the socket and
 * forward the upgrade (see `createGenericProxyRouter`).
 */
export default class WebSocketUpgradeHandler {
    private readonly sockets = new Set<Duplex>();
    private closing = false;

    constructor(
        private readonly app: (
            req: IncomingMessage,
            res: ServerResponse
        ) => void
    ) {
        this.handleUpgrade = this.handleUpgrade.bind(this);
    }

    get activeSocketCount() {
        return this.sockets.size;
    }

    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
        socket.on("error", () => socket.destroy());

        if (this.closing) {
            return rejectWebSocketHandshake(socket, 503);
        }
        if (!isWebSocketHandshake(req)) {
            return rejectWebSocketHandshake(socket, 400);
        }

        this.sockets.add(socket);
        socket.once("close", () => this.sockets.delete(socket));

        const context: WebSocketUpgradeContext = {
            socket,
            head,
            claimed: false
        };
        (req as UpgradeRequest)[UPGRADE_CONTEXT] = context;

        const res = new ServerResponse(req);
        res.shouldKeepAlive = false;
        res.assignSocket(socket as Socket);
        res.once("finish", () => {
            // the app answered the handshake with an ordinary HTTP response
            if (!context.claimed) {
                closeSocketGracefully(socket);
            }
        });

        this.app(req, res);
    }

    /**
     * Stop accepting upgrades and close all upgraded connections, e.g. on SIGTERM.
     * Node's `server.close()` / http-terminator do not track upgraded sockets.
     */
    closeAll() {
        this.closing = true;
        this.sockets.forEach((socket) => socket.destroy());
        this.sockets.clear();
    }
}
