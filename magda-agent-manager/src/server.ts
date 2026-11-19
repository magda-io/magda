import http, { IncomingMessage, ServerResponse } from "node:http";
import { RuntimeProxy, isClosingConnection } from "./runtimeProxy.js";

/**
 * The Manager's HTTP server: runtime paths go to the DSH runtime proxy, the
 * rest to the Express app, and WebSocket upgrades on runtime paths to the
 * proxy.
 *
 * A request or upgrade parsed on a connection that is closing after an early
 * answer (see `lingerAfterResponse` in runtimeProxy.ts) is dropped before
 * either sees it: the client was told the connection closes and won't expect
 * an answer, so the request must not run.
 */
export function createManagerServer(
    runtimePrefix: string,
    app: (req: IncomingMessage, res: ServerResponse) => void,
    proxy: RuntimeProxy
): http.Server {
    const isRuntimePath = (url: string | undefined) =>
        url === runtimePrefix ||
        !!url?.startsWith(`${runtimePrefix}/`) ||
        !!url?.startsWith(`${runtimePrefix}?`);
    const server = http.createServer((req, res) => {
        if (isClosingConnection(req.socket)) {
            req.socket.destroy();
            return;
        }
        if (isRuntimePath(req.url)) {
            proxy.handleHttp(req, res);
            return;
        }
        app(req, res);
    });
    // Streamed uploads may take longer than Node's default five minutes.
    server.requestTimeout = 0;
    server.on("upgrade", (req, socket, head) => {
        if (isClosingConnection(socket) || !isRuntimePath(req.url)) {
            socket.destroy();
            return;
        }
        proxy.handleUpgrade(req, socket, head);
    });
    return server;
}
