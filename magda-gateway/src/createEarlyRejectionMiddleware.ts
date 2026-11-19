import express from "express";
import { IncomingMessage, ServerResponse } from "node:http";
import { Duplex } from "node:stream";

export interface EarlyRejectionOptions {
    /** Longest time, in seconds, to keep reading a rejected request's body. */
    lingerSeconds: number;
    /** Most bytes of a rejected request's body to read and discard. */
    maxDiscardBytes: number;
}

const earlyRejected = new WeakSet<IncomingMessage>();
// Connections closing after an early rejection: see `linger`.
const closingSockets = new WeakSet<Duplex>();

/** Whether `req` got an error response before its body had arrived. */
export function isEarlyRejected(req: IncomingMessage) {
    return earlyRejected.has(req);
}

/** Whether `req` has a body that hasn't fully arrived yet. */
export function hasIncompleteBody(req: IncomingMessage) {
    if (req.complete || req.readableEnded) return false;
    return (
        Number(req.headers["content-length"]) > 0 ||
        req.headers["transfer-encoding"] !== undefined
    );
}

/**
 * Lingering close for error responses (4xx/5xx) sent before the request body
 * has arrived, whether the Gateway or an upstream produced them, e.g. a 401,
 * 403 or 413 for an upload.
 *
 * Closing the connection while the client is still sending makes its next
 * write fail, and the client (nginx, for a browser) may then never read the
 * response. So the response is sent as usual, and the rest of the body is
 * read and discarded, for at most `lingerSeconds` and `maxDiscardBytes`.
 * The connection is then closed: it's never reused after an incomplete
 * request.
 *
 * The response says `Connection: close`, so no client reuses the
 * connection; Node would end it as soon as the response finished, so that is
 * deferred until the body has been read or a limit is reached. Responses to
 * requests without a body, or whose body has arrived (e.g. SSE streams), are
 * unchanged.
 *
 * A connection can live at most 2 × `lingerSeconds` after the rejection
 * starts: `lingerSeconds` to discard the body, then, if the response itself
 * hasn't finished by then, `lingerSeconds` more for it before the connection
 * is closed regardless. The request timeout may close it sooner.
 */
export default function createEarlyRejectionMiddleware(
    options: EarlyRejectionOptions
): express.RequestHandler {
    return (req, res, next) => {
        if (closingSockets.has(req.socket)) {
            // A request pipelined behind a rejected one. The client was told
            // the connection closes and won't expect an answer, so it must not
            // run: drop it and close the connection.
            req.socket.destroy();
            return;
        }
        const writeHead = res.writeHead;
        res.writeHead = function (
            this: ServerResponse,
            statusCode: number,
            ...rest: any[]
        ) {
            if (
                statusCode >= 400 &&
                !res.headersSent &&
                hasIncompleteBody(req)
            ) {
                linger(req, res, options);
                closeHeaders(res, rest);
            }
            return writeHead.apply(this, [statusCode, ...rest] as any);
        } as typeof res.writeHead;
        next();
    };
}

/** Answer `Connection: close`, also over headers passed to `writeHead`. */
function closeHeaders(res: ServerResponse, writeHeadArgs: any[]) {
    res.setHeader("connection", "close");
    for (const arg of writeHeadArgs) {
        if (arg && typeof arg === "object" && !Array.isArray(arg)) {
            for (const name of Object.keys(arg)) {
                if (name.toLowerCase() === "connection") delete arg[name];
            }
        }
    }
}

function linger(
    req: IncomingMessage,
    res: ServerResponse,
    { lingerSeconds, maxDiscardBytes }: EarlyRejectionOptions
) {
    earlyRejected.add(req);
    const socket = req.socket;
    closingSockets.add(socket);
    // Node's HTTP server calls `socket.destroySoon()` as soon as a
    // `Connection: close` response finishes; it ends the connection and stops
    // reading. Here that would cut the client off while it's still sending the
    // rejected body, and it could then lose the response (the reason for
    // lingering). So the call is ignored on this one socket while the body is
    // discarded, and the original is restored and called by `close` below.
    // Answering `keep-alive` instead isn't an option: clients would reuse a
    // connection that is about to close.
    const destroySoon = socket.destroySoon;
    socket.destroySoon = () => undefined;
    let discarded = 0;
    let bodyDone = false;
    let responseDone = false;
    let limitReached = false;
    let forceClose: NodeJS.Timeout | undefined;
    // Close once the response has been sent and the body has been read to
    // the end (gracefully) or a limit was reached.
    const close = () => {
        if (!responseDone || !(bodyDone || limitReached)) return;
        clearTimeout(timer);
        clearTimeout(forceClose);
        socket.destroySoon = destroySoon;
        if (bodyDone) socket.destroySoon();
        else socket.destroy();
    };
    const stop = () => {
        if (limitReached) return;
        limitReached = true;
        req.pause();
        // Don't wait indefinitely for a response that doesn't finish.
        forceClose = setTimeout(() => socket.destroy(), lingerSeconds * 1000);
        close();
    };
    const timer = setTimeout(stop, lingerSeconds * 1000);
    req.on("data", (chunk: Buffer) => {
        discarded += chunk.length;
        if (discarded > maxDiscardBytes) stop();
    });
    req.once("end", () => {
        bodyDone = true;
        close();
    });
    res.once("finish", () => {
        responseDone = true;
        close();
    });
    socket.once("close", () => {
        // Closed early (e.g. the client went away): nothing left to do.
        clearTimeout(timer);
        clearTimeout(forceClose);
        socket.destroySoon = destroySoon;
    });
    req.resume();
}
