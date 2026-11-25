import express, { NextFunction, Request, Response } from "express";
import http from "node:http";
import https from "node:https";
import type pg from "pg";
import RequestMeter from "./metering/RequestMeter.js";
import { prepareRequestBody } from "./metering/requestBody.js";
import {
    DEFAULT_USAGE_ESTIMATE,
    LoggingUsageSink,
    UsageEstimateConfig,
    UsageSink
} from "./metering/settlement.js";
import CallerAccessResolver, {
    Caller,
    DEFAULT_DECISION_CACHE_SECONDS
} from "./access/CallerAccess.js";
import Admission from "./access/Admission.js";
import ServedModels from "./access/ServedModels.js";
import UsageLedger from "./usage/UsageLedger.js";
import ProfileService from "./profiles/ProfileService.js";
import createProfileRouter from "./profiles/createProfileRouter.js";
import { DEFAULT_USAGE_TIME_ZONE } from "./usage/periods.js";

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
    /** The LLM Services database (#3838); when set, readiness checks it. */
    pool?: pg.Pool;
    /** Receives one usage settlement per forwarded request (#3838 USE-7). */
    usageSink?: UsageSink;
    /** METER-4 estimate settings. */
    usageEstimate?: UsageEstimateConfig;
    /** METER-3 observer limits, in bytes. */
    observerLimits?: { maxEventBytes?: number; maxJsonBytes?: number };
    /** USE-3: the IANA zone of accounting dates (DEP-3 `usage.timeZone`). */
    usageTimeZone?: string;
    /** EVAL-3: per-user invoke decision cache TTL (DEP-3 `decisionCacheSeconds`). */
    decisionCacheSeconds?: number;
    /** The usage ledger; by default built on `pool`. */
    ledger?: UsageLedger;
    /** Profile lifecycle for the management API (#3940); needs the database. */
    profiles?: ProfileService;
    /** MODEL-2: LiteLLM's served aliases; by default built from `liteLlmUrl`. */
    servedModels?: ServedModels;
}

// Upstream connection errors where the request can't have reached the model
// provider: nothing to charge.
const NOT_FORWARDED_ERROR_CODES = new Set([
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "EHOSTUNREACH",
    "ENETUNREACH"
]);

export default function createApp(config: LlmServicesConfig) {
    const {
        jwtSecret,
        authApiUrl,
        liteLlmUrl,
        liteLlmKey,
        allowedModels,
        pool,
        usageEstimate = DEFAULT_USAGE_ESTIMATE,
        observerLimits = {},
        usageTimeZone = DEFAULT_USAGE_TIME_ZONE,
        decisionCacheSeconds = DEFAULT_DECISION_CACHE_SECONDS
    } = config;
    const ledger =
        config.ledger ??
        (pool ? new UsageLedger(pool, { timeZone: usageTimeZone }) : undefined);
    // USE-7: settle into the ledger; without a database (local development),
    // settlements are only logged.
    const usageSink: UsageSink =
        config.usageSink ?? ledger ?? new LoggingUsageSink();
    const callers = new CallerAccessResolver({
        jwtSecret,
        authApiUrl,
        decisionCacheSeconds
    });
    const servedModels =
        config.servedModels ?? new ServedModels({ liteLlmUrl, liteLlmKey });
    const admission = new Admission({
        pool,
        ledger,
        allowedModels,
        servedModels
    });

    function sendError(
        res: Response,
        status: number,
        message: string,
        code?: string
    ) {
        res.status(status).json({
            error: { message, ...(code ? { code } : {}) }
        });
    }

    /**
     * Verifies the MAGDA session and resolves which profiles the caller may
     * invoke (EVAL-1, EVAL-3). LLM calls need an `llm/access/invoke` grant,
     * not `agentWorkspace/access` (AUTH-4).
     */
    async function requireCaller(
        req: Request,
        res: Response,
        next: NextFunction
    ) {
        // every response is user-specific (Public API)
        res.setHeader("Cache-Control", "private, no-store");
        let result;
        try {
            result = await callers.resolve(req.get("X-Magda-Session"));
        } catch (error) {
            // Authorization API unavailable: not an access decision (API-11)
            console.error("LLM authorization lookup failed", error);
            sendError(res, 503, "Unable to verify Magda LLM access");
            return;
        }
        if (result.status === "unauthenticated") {
            sendError(res, 401, "Magda authentication required");
            return;
        }
        if (result.status === "invalid_session") {
            sendError(res, 401, "Invalid Magda session");
            return;
        }
        res.locals.caller = result.caller;
        // the verified session user: the only identity usage is counted against (USE-2)
        res.locals.userId = result.caller.userId;
        next();
    }

    function proxyToLiteLlm(
        req: Request,
        res: Response,
        path: string,
        body: Buffer,
        meter: RequestMeter
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
                meter.responseStarted(
                    upstreamResponse.statusCode || 502,
                    upstreamResponse.headers["content-type"]
                );
                let ended = false;
                // Observe with a synchronous data listener on the same source as
                // pipe(): pipe's backpressure still governs reads, and the
                // forwarded bytes are never changed (METER-3).
                upstreamResponse.on("data", (chunk: Buffer) =>
                    meter.write(chunk)
                );
                upstreamResponse.once("end", () => {
                    ended = true;
                    void meter.responseEnded();
                });
                upstreamResponse.once("close", () => {
                    if (ended) return;
                    void meter.interrupted();
                    // A response cut off mid-way (its connection dropped) would
                    // otherwise leave the client waiting: pipe() doesn't end the
                    // destination. End it as a failed connection, as the Gateway
                    // does (#3930), so it never looks complete.
                    if (!res.writableEnded) res.destroy();
                });
                // Not `cache-control`: model responses are user-specific, and
                // LLM Services' own `private, no-store` (set in requireCaller)
                // must not be overridden by the upstream's.
                const responseHeaders: http.OutgoingHttpHeaders = {};
                for (const header of [
                    "content-type",
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
            if (!res.writableEnded) {
                upstream.destroy();
                void meter.interrupted();
            }
        });
        upstream.on("error", (error: NodeJS.ErrnoException) => {
            console.error("LiteLLM request failed", error);
            if (error.code && NOT_FORWARDED_ERROR_CODES.has(error.code)) {
                meter.notForwarded();
            } else {
                void meter.failedBeforeResponse();
            }
            if (!res.headersSent) {
                res.status(502).json({
                    error: {
                        message: "The configured model provider is unavailable"
                    }
                });
            } else if (!res.writableEnded) {
                // Never write over a response that has started; a truncated
                // one must end as a failed connection, not look complete.
                res.destroy();
            }
        });
        upstream.end(body);
    }

    const app = express();
    app.disable("x-powered-by");
    app.get("/v0/status/live", (_req, res) => res.json({ status: "ok" }));
    app.get("/v0/status/ready", async (_req, res) => {
        if (pool) {
            try {
                await pool.query("SELECT 1");
            } catch (error) {
                console.error("LLM Services database is unavailable", error);
                res.status(503).json({ status: "database unavailable" });
                return;
            }
        }
        res.json({ status: "ok" });
    });
    // profile management (API-1 to API-6, #3940)
    app.use(
        "/v0",
        createProfileRouter({
            jwtSecret,
            authApiUrl,
            allowedModels,
            servedModels,
            profiles: config.profiles
        })
    );

    app.use("/v0/v1", requireCaller);

    // API-9: the aliases the caller can invoke through at least one eligible
    // profile, whether or not its quota is used up
    app.get("/v0/v1/models", async (_req, res) => {
        let models: string[];
        try {
            models = await admission.invocableModels(
                res.locals.caller as Caller
            );
        } catch (error) {
            console.error(
                JSON.stringify({
                    event: "llm-model-list-failed",
                    error: error instanceof Error ? error.message : "unknown"
                })
            );
            sendError(res, 503, "Unable to list the available models");
            return;
        }
        res.json({
            object: "list",
            data: models.map((id) => ({
                id,
                object: "model",
                owned_by: "magda"
            }))
        });
    });

    function proxyModelRequest(path: string) {
        return async (req: Request, res: Response) => {
            const body = Buffer.isBuffer(req.body)
                ? req.body
                : Buffer.from(JSON.stringify(req.body || {}));
            let parsed: unknown;
            try {
                parsed = JSON.parse(body.toString("utf8"));
            } catch {
                parsed = undefined;
            }
            if (
                !parsed ||
                typeof parsed !== "object" ||
                Array.isArray(parsed)
            ) {
                res.status(400).json({
                    error: { message: "Invalid JSON request" }
                });
                return;
            }
            const request = parsed as Record<string, unknown>;
            const model =
                typeof request.model === "string" ? request.model : undefined;
            if (!model || !allowedModels.has(model)) {
                // MODEL-1: the deployment allowlist binds everyone
                sendError(res, 403, "The requested model is not available");
                return;
            }
            // USE-3: the admission instant is the request's start, and decides
            // its accounting date at settlement too
            const requestStartedAt = new Date();
            const decision = await admission.admit(
                res.locals.caller as Caller,
                model,
                requestStartedAt
            );
            if (decision.status === "no_eligible_profile") {
                sendError(
                    res,
                    403,
                    "No LLM access profile available to you covers the requested model",
                    "llm_no_eligible_profile"
                );
                return;
            }
            if (decision.status === "quota_exceeded") {
                // OpenAI SDKs retry 429s unless told not to
                res.setHeader("x-should-retry", "false");
                sendError(
                    res,
                    429,
                    "Your token usage limit for the requested model has been reached",
                    "llm_quota_exceeded"
                );
                return;
            }
            if (decision.status === "ledger_unavailable") {
                sendError(
                    res,
                    503,
                    "LLM usage accounting is temporarily unavailable",
                    "llm_usage_unavailable"
                );
                return;
            }
            if (res.destroyed) return; // the client left during admission
            const prepared = prepareRequestBody(path, body, request);
            const meter = new RequestMeter({
                userId: res.locals.userId,
                modelAlias: model,
                endpoint: path,
                requestStartedAt,
                requestBodyBytes: prepared.body.length,
                sink: usageSink,
                estimate: usageEstimate,
                ...observerLimits
            });
            proxyToLiteLlm(req, res, path, prepared.body, meter);
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
