/** Disposable #3934 transport experiment. Never imported by the production service. */
import http from "node:http";
import https from "node:https";
import { AddressInfo } from "node:net";
import { once } from "node:events";
import { createUsageObserver, UsageObservation } from "./usage-observer.js";

export interface TapObservation {
    status: number;
    outcome: "end" | "cancelled" | "error" | "timeout";
    usage?: UsageObservation;
}

// Never forward hop-by-hop headers, including headers named by Connection.
function transportHeaders(headers: http.IncomingHttpHeaders) {
    const result = { ...headers };
    const excluded = [
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        ...(headers.connection || "")
            .toLowerCase()
            .split(",")
            .map((s) => s.trim())
    ];
    excluded.forEach((name) => delete result[name]);
    return result;
}

/**
 * Put this loopback tap BETWEEN an unchanged createApp facade and LiteLLM.
 * Observation uses a synchronous data listener on the same source as pipe(), so
 * Node's normal pipe backpressure still governs reads. No response reserialization,
 * body logging, request buffering, usage insertion or provider routing changes.
 */
export async function startUsageTap(
    target: URL,
    report: (observation: TapObservation) => void,
    { timeoutMs = 120_000 }: { timeoutMs?: number } = {}
) {
    if (target.protocol !== "http:" && target.protocol !== "https:") {
        throw new Error("Usage tap target must use HTTP or HTTPS");
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error("Usage tap idle timeout must be positive and finite");
    }
    const transport = target.protocol === "https:" ? https : http;
    const server = http.createServer((req, res) => {
        let upstreamResponse: http.IncomingMessage | undefined;
        let observer: ReturnType<typeof createUsageObserver> | undefined;
        let settled = false;
        let status = 502;
        function finish(outcome: TapObservation["outcome"]) {
            if (settled) return;
            settled = true;
            // A reporting sink must never disrupt the proxied stream.
            try {
                report({ status, outcome, usage: observer?.finish() });
            } catch {
                // No exception messages: sinks could contain private data.
            }
        }
        const upstream = transport.request(
            {
                protocol: target.protocol,
                hostname: target.hostname,
                port: target.port,
                path: `${target.pathname.replace(/\/$/, "")}${req.url}`,
                method: req.method,
                headers: { ...transportHeaders(req.headers), host: target.host }
            },
            (response) => {
                upstreamResponse = response;
                status = response.statusCode || 502;
                const encoding = response.headers["content-encoding"];
                const type = response.headers["content-type"] || "";
                if (!encoding || encoding === "identity") {
                    if (type.toLowerCase().includes("text/event-stream")) {
                        observer = createUsageObserver({ format: "sse" });
                    } else if (
                        type.toLowerCase().includes("application/json")
                    ) {
                        observer = createUsageObserver({ format: "json" });
                    }
                }
                res.writeHead(status, transportHeaders(response.headers));
                response.on("data", (chunk: Buffer) => observer?.write(chunk));
                response.once("end", () => finish("end"));
                response.once("error", () => {
                    finish("error");
                    res.destroy();
                });
                response.pipe(res);
            }
        );
        upstream.setTimeout(timeoutMs, () => {
            finish("timeout");
            upstream.destroy();
            upstreamResponse?.destroy();
            res.destroy();
        });
        upstream.once("error", () => {
            finish("error");
            if (!res.headersSent) res.writeHead(502);
            res.end();
        });
        req.once("aborted", () => {
            finish("cancelled");
            upstream.destroy();
            upstreamResponse?.destroy();
        });
        res.once("close", () => {
            if (!res.writableEnded) {
                finish("cancelled");
                upstream.destroy();
                upstreamResponse?.destroy();
            }
        });
        req.pipe(upstream);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return {
        server,
        url: new URL(
            `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        )
    };
}
