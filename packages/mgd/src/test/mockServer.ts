import http from "node:http";
import { AddressInfo } from "node:net";

export interface RecordedRequest {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: Buffer;
}

export interface MockRoute {
    method: string;
    path: RegExp | string;
    status?: number;
    body?: unknown;
    headers?: Record<string, string>;
    handler?: (
        req: http.IncomingMessage,
        res: http.ServerResponse,
        recorded: RecordedRequest
    ) => void;
}

export async function startMockServer(routes: MockRoute[]) {
    const requests: RecordedRequest[] = [];
    const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            const recorded: RecordedRequest = {
                method: req.method || "",
                url: req.url || "",
                headers: Object.fromEntries(
                    Object.entries(req.headers).map(([k, v]) => [
                        k,
                        Array.isArray(v) ? v.join(",") : v || ""
                    ])
                ),
                body: Buffer.concat(chunks)
            };
            requests.push(recorded);
            const urlPath = (req.url || "").split("?")[0];
            const route = routes.find(
                (r) =>
                    r.method === req.method &&
                    (typeof r.path === "string"
                        ? r.path === urlPath
                        : r.path.test(urlPath))
            );
            if (!route) {
                res.writeHead(404, { "content-type": "application/json" });
                res.end(JSON.stringify({ message: "no such route" }));
                return;
            }
            if (route.handler) {
                route.handler(req, res, recorded);
                return;
            }
            res.writeHead(route.status ?? 200, {
                "content-type": "application/json",
                ...route.headers
            });
            res.end(
                typeof route.body === "string"
                    ? route.body
                    : JSON.stringify(route.body ?? {})
            );
        });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () =>
            new Promise<void>((resolve, reject) =>
                server.close((e) => (e ? reject(e) : resolve()))
            )
    };
}
