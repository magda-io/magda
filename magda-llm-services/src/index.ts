import express, { NextFunction, Request, Response } from "express";
import http from "node:http";
import https from "node:https";
import jwt, { JwtPayload } from "jsonwebtoken";
import { ADMIN_USERS_ROLE_ID } from "magda-typescript-common/src/authorization-api/constants.js";

const port = Number(process.env.PORT || 80);
const jwtSecret = process.env.JWT_SECRET;
const authApiUrl = process.env.AUTH_API_URL || "http://authorization-api/v0";
const liteLlmUrl = new URL(process.env.LITELLM_URL || "http://litellm:4000");
const liteLlmKey = process.env.LITELLM_MASTER_KEY;
const allowedModels = new Set(
    (process.env.ALLOWED_MODELS || "magda-agent-default")
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean)
);
if (!jwtSecret) throw new Error("JWT_SECRET is required");
if (!liteLlmKey) throw new Error("LITELLM_MASTER_KEY is required");

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const token = req.get("X-Magda-Session");
    if (!token) {
        res.status(401).json({
            error: { message: "Magda authentication required" }
        });
        return;
    }
    let payload: JwtPayload;
    try {
        payload = jwt.verify(token, jwtSecret!, {
            algorithms: ["HS256"]
        }) as JwtPayload;
    } catch {
        res.status(401).json({ error: { message: "Invalid Magda session" } });
        return;
    }
    try {
        const response = await fetch(
            `${authApiUrl.replace(/\/$/, "")}/public/users/whoami`,
            {
                headers: { "X-Magda-Session": token },
                signal: AbortSignal.timeout(10_000)
            }
        );
        const user = response.ok
            ? ((await response.json()) as {
                  id?: string;
                  roles?: Array<{ id?: string }>;
              })
            : undefined;
        if (
            !user ||
            user.id !== payload.userId ||
            !user.roles?.some((role) => role.id === ADMIN_USERS_ROLE_ID)
        ) {
            res.status(response.status === 401 ? 401 : 403).json({
                error: {
                    message:
                        "Magda LLM access is currently limited to administrators"
                }
            });
            return;
        }
        next();
    } catch (error) {
        console.error("LLM authorization lookup failed", error);
        res.status(503).json({
            error: { message: "Unable to verify Magda LLM access" }
        });
    }
}

function proxyToLiteLlm(
    req: Request,
    res: Response,
    path: string,
    body?: Buffer
) {
    const transport = liteLlmUrl.protocol === "https:" ? https : http;
    const headers: http.OutgoingHttpHeaders = {
        accept: req.get("accept") || "application/json",
        "content-type": req.get("content-type") || "application/json",
        authorization: `Bearer ${liteLlmKey}`,
        host: liteLlmUrl.host
    };
    if (body) headers["content-length"] = body.length;
    const upstream = transport.request(
        {
            protocol: liteLlmUrl.protocol,
            hostname: liteLlmUrl.hostname,
            port: liteLlmUrl.port,
            method: req.method,
            path: `${liteLlmUrl.pathname.replace(/\/$/, "")}${path}`,
            headers
        },
        (upstreamResponse) => {
            const responseHeaders: http.OutgoingHttpHeaders = {};
            for (const header of [
                "content-type",
                "cache-control",
                "retry-after",
                "x-request-id"
            ]) {
                const value = upstreamResponse.headers[header];
                if (value !== undefined) responseHeaders[header] = value;
            }
            res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
            upstreamResponse.pipe(res);
        }
    );
    upstream.setTimeout(120_000, () =>
        upstream.destroy(new Error("LiteLLM request timed out"))
    );
    res.once("close", () => {
        if (!res.writableEnded) upstream.destroy();
    });
    upstream.on("error", (error) => {
        console.error("LiteLLM request failed", error);
        if (!res.headersSent) {
            res.status(502).json({
                error: {
                    message: "The configured model provider is unavailable"
                }
            });
        } else {
            res.end();
        }
    });
    upstream.end(body);
}

const app = express();
app.disable("x-powered-by");
app.get("/v0/status/live", (_req, res) => res.json({ status: "ok" }));
app.get("/v0/status/ready", (_req, res) => res.json({ status: "ok" }));
app.use("/v0/v1", requireAdmin);

app.get("/v0/v1/models", (_req, res) => {
    res.json({
        object: "list",
        data: [...allowedModels].map((id) => ({
            id,
            object: "model",
            owned_by: "magda"
        }))
    });
});

app.post(
    "/v0/v1/chat/completions",
    express.raw({ type: "application/json", limit: "2mb" }),
    (req, res) => {
        const body = Buffer.isBuffer(req.body)
            ? req.body
            : Buffer.from(JSON.stringify(req.body || {}));
        let model: string | undefined;
        try {
            model = JSON.parse(body.toString("utf8")).model;
        } catch {
            res.status(400).json({
                error: { message: "Invalid JSON request" }
            });
            return;
        }
        if (!model || !allowedModels.has(model)) {
            res.status(403).json({
                error: { message: "The requested model is not available" }
            });
            return;
        }
        proxyToLiteLlm(req, res, "/v1/chat/completions", body);
    }
);

const server = app.listen(port, () =>
    console.log(JSON.stringify({ event: "llm-services-listening", port }))
);
server.requestTimeout = 0;
process.on("SIGTERM", () => server.close(() => process.exit(0)));
