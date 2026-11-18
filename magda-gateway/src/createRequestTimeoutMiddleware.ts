import express from "express";

/**
 * The timeout, in seconds, for receiving a request to `path`: the longest
 * configured path that equals `path` or is a whole-segment prefix of it, or
 * the default. 0 means no limit.
 */
export function requestTimeoutFor(
    path: string,
    defaultSeconds: number,
    perPath: Record<string, number> = {}
): number {
    let match: string | undefined;
    let matchLength = -1;
    for (const key of Object.keys(perPath)) {
        const prefix = key.replace(/\/+$/, "");
        const matches =
            prefix === "" || path === prefix || path.startsWith(`${prefix}/`);
        if (matches && prefix.length > matchLength) {
            match = key;
            matchLength = prefix.length;
        }
    }
    return match === undefined ? defaultSeconds : perPath[match];
}

/**
 * Node's `server.requestTimeout`, per request path: a client that doesn't
 * finish sending its request in time gets 408 and the connection is closed.
 * Node applies one value to the whole server, so the server's own limit is
 * turned off (see index.ts) and this middleware, installed first, enforces
 * the default and any per-path override (e.g. long Agent Workspace uploads).
 */
export default function createRequestTimeoutMiddleware(
    defaultSeconds: number,
    perPath: Record<string, number> = {}
): express.RequestHandler {
    return (req, res, next) => {
        const seconds = requestTimeoutFor(
            req.originalUrl.split("?", 1)[0],
            defaultSeconds,
            perPath
        );
        if (!(seconds > 0) || req.complete) return next();
        const timer = setTimeout(() => {
            if (req.complete) return;
            if (!res.headersSent) {
                res.writeHead(408, { connection: "close" });
                res.end();
            }
            req.socket.destroy();
        }, seconds * 1000);
        const clear = () => clearTimeout(timer);
        req.once("end", clear);
        res.once("close", clear);
        next();
    };
}
