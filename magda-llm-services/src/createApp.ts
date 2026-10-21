import express, { NextFunction, Request, Response } from "express";
import http from "node:http";
import https from "node:https";
import jwt, { JwtPayload } from "jsonwebtoken";

// Agent Workspace model access uses the same grantable self-only operation as
// the Workspace itself (#3858); administrators are allowed by the policy
// engine's administrator override.
const AGENT_WORKSPACE_ACCESS_OPERATION = "agentWorkspace/access";

export function parseAllowedModels(value: string | undefined): Set<string> {
    if (value === undefined) {
        throw new Error("ALLOWED_MODELS is required and must be a JSON array");
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw new Error("ALLOWED_MODELS must be a valid JSON array");
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error(
            "ALLOWED_MODELS must be a non-empty JSON array of model IDs"
        );
    }
    const models = new Set<string>();
    parsed.forEach((model, index) => {
        if (typeof model !== "string" || !model.trim()) {
            throw new Error(
                `ALLOWED_MODELS[${index}] must be a non-empty string`
            );
        }
        const normalized = model.trim();
        if (models.has(normalized)) {
            throw new Error(
                `ALLOWED_MODELS contains duplicate model ID ${JSON.stringify(
                    normalized
                )}`
            );
        }
        models.add(normalized);
    });
    return models;
}

export interface LlmServicesConfig {
    jwtSecret: string;
    authApiUrl: string;
    liteLlmUrl: URL;
    liteLlmKey: string;
    allowedModels: ReadonlySet<string>;
}

export default function createApp(config: LlmServicesConfig) {
    const {
        jwtSecret,
        authApiUrl,
        liteLlmUrl,
        liteLlmKey,
        allowedModels
    } = config;

    async function requireWorkspaceAccess(
        req: Request,
        res: Response,
        next: NextFunction
    ) {
        const token = req.get("X-Magda-Session");
        if (!token) {
            res.status(401).json({
                error: { message: "Magda authentication required" }
            });
            return;
        }
        let payload: JwtPayload;
        try {
            payload = jwt.verify(token, jwtSecret, {
                algorithms: ["HS256"]
            }) as JwtPayload;
        } catch {
            res.status(401).json({
                error: { message: "Invalid Magda session" }
            });
            return;
        }
        try {
            const base = authApiUrl.replace(/\/$/, "");
            const headers = { "X-Magda-Session": token };
            const response = await fetch(`${base}/public/users/whoami`, {
                headers,
                signal: AbortSignal.timeout(10_000)
            });
            if (!response.ok && response.status !== 401) {
                // Authorization API unavailable: not an access decision.
                throw new Error(
                    `Session verification failed with HTTP ${response.status}`
                );
            }
            const user = response.ok
                ? ((await response.json()) as { id?: string })
                : undefined;
            if (!user || user.id !== payload.userId) {
                res.status(401).json({
                    error: { message: "Invalid Magda session" }
                });
                return;
            }
            // `unknowns=` requests a full (not partial) policy evaluation.
            const decisionResponse = await fetch(
                `${base}/opa/decision/${AGENT_WORKSPACE_ACCESS_OPERATION}?unknowns=`,
                { headers, signal: AbortSignal.timeout(10_000) }
            );
            if (!decisionResponse.ok) {
                throw new Error(
                    `Policy decision failed with HTTP ${decisionResponse.status}`
                );
            }
            const decision = (await decisionResponse.json()) as {
                hasResidualRules?: boolean;
                result?: unknown;
            };
            if (
                decision?.hasResidualRules !== false ||
                decision.result !== true
            ) {
                res.status(403).json({
                    error: {
                        message:
                            "Magda LLM access requires Agent Workspace access"
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
                res.writeHead(
                    upstreamResponse.statusCode || 502,
                    responseHeaders
                );
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
    app.use("/v0/v1", requireWorkspaceAccess);

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

    function proxyModelRequest(path: string) {
        return (req: Request, res: Response) => {
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
            proxyToLiteLlm(req, res, path, body);
        };
    }

    const modelRequestBody = express.raw({
        type: "application/json",
        limit: "2mb"
    });
    app.post(
        "/v0/v1/chat/completions",
        modelRequestBody,
        proxyModelRequest("/v1/chat/completions")
    );
    app.post(
        "/v0/v1/responses",
        modelRequestBody,
        proxyModelRequest("/v1/responses")
    );

    return app;
}
