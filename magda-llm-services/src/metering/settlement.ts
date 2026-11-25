// Usage settlement for forwarded model requests (#3838 USE-7, METER-4, METER-5).

import {
    isValidObserverLimit,
    MAX_OBSERVER_LIMIT_BYTES
} from "./usageObserver.js";

/** One settled forwarded request: measured, or estimated when no valid final usage exists. */
export type UsageSettlement = {
    /**
     * A random ID per forwarded request, so a sink can drop a repeated
     * settlement of the same request (METER-5, USE-7).
     */
    requestId: string;
    /** The authenticated MAGDA user (USE-2): never a client-supplied field. */
    userId: string;
    /** The requested public model alias (USE-2). */
    modelAlias: string;
    /** When the request was admitted: decides its local accounting date (USE-3). */
    requestStartedAt: Date;
    /** `/v1/chat/completions` or `/v1/responses`. */
    endpoint: string;
    /** Metadata-only quality flags, for operators. */
    quality: SettlementQuality;
} & (
    | {
          kind: "measured";
          inputTokens: number;
          outputTokens: number;
      }
    | {
          kind: "estimated";
          estimatedTokens: number;
          reason: EstimateReason;
      }
);

export type EstimateReason =
    /** The response finished without a valid final usage snapshot. */
    | "missing_final_usage"
    /**
     * The client went away, or the upstream request failed or timed out,
     * mid-response or after the request was sent but before any response.
     */
    | "interrupted"
    /** A 2xx response whose format can't be observed (unexpected content type). */
    | "unobservable"
    /** The usage observer failed; the response was still forwarded. */
    | "observer_error";

export interface SettlementQuality {
    status?: number;
    format?: "sse" | "json";
    terminalSeen?: boolean;
    malformedEvents?: number;
    oversizedEvents?: number;
    unknownEventTypes?: number;
    invalidUsageEvents?: number;
}

/**
 * Receives settlements. The daily ledger (`UsageLedger`, #3942) implements
 * it; without a database, a logging sink records them. A sink must not throw for an accounting failure
 * it can handle itself; the meter catches and logs anything it does throw.
 */
export interface UsageSink {
    settle(settlement: UsageSettlement): Promise<void>;
}

/** Logs settlements as metadata-only JSON events. No prompts or model output. */
export class LoggingUsageSink implements UsageSink {
    async settle(settlement: UsageSettlement): Promise<void> {
        console.log(
            JSON.stringify({
                event: "llm-usage-settled",
                ...settlement,
                requestStartedAt: settlement.requestStartedAt.toISOString()
            })
        );
    }
}

export interface UsageEstimateConfig {
    /** Request body bytes per estimated input token (default 4). */
    bytesPerToken: number;
    /** Estimated output tokens per request (default 4096). */
    outputTokens: number;
    /** Optional per-alias override of `outputTokens`. */
    outputTokensByModel: Readonly<Record<string, number>>;
}

export const DEFAULT_USAGE_ESTIMATE: UsageEstimateConfig = {
    bytesPerToken: 4,
    outputTokens: 4096,
    outputTokensByModel: {}
};

/**
 * METER-4: `ceil(request body bytes / bytesPerToken) + outputAllowance`. A
 * deliberately coarse, documented estimate, not a tokenizer.
 */
export function estimateTokens(
    requestBodyBytes: number,
    modelAlias: string,
    config: UsageEstimateConfig = DEFAULT_USAGE_ESTIMATE
): number {
    const output = Object.prototype.hasOwnProperty.call(
        config.outputTokensByModel,
        modelAlias
    )
        ? config.outputTokensByModel[modelAlias]
        : config.outputTokens;
    return Math.ceil(requestBodyBytes / config.bytesPerToken) + output;
}

function positiveInteger(value: unknown, name: string): number {
    if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 1
    ) {
        throw new Error(`${name} must be a positive integer`);
    }
    return value;
}

function nonNegativeInteger(value: unknown, name: string): number {
    if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 0
    ) {
        throw new Error(`${name} must be a non-negative integer`);
    }
    return value;
}

/** Parse the estimate settings from environment variables (DEP-3, set by Helm). */
export function parseUsageEstimateConfig(
    env: NodeJS.ProcessEnv
): UsageEstimateConfig {
    const config: UsageEstimateConfig = {
        bytesPerToken: DEFAULT_USAGE_ESTIMATE.bytesPerToken,
        outputTokens: DEFAULT_USAGE_ESTIMATE.outputTokens,
        outputTokensByModel: {}
    };
    if (env.USAGE_ESTIMATE_BYTES_PER_TOKEN) {
        config.bytesPerToken = positiveInteger(
            Number(env.USAGE_ESTIMATE_BYTES_PER_TOKEN),
            "USAGE_ESTIMATE_BYTES_PER_TOKEN"
        );
    }
    if (env.USAGE_ESTIMATE_OUTPUT_TOKENS) {
        config.outputTokens = nonNegativeInteger(
            Number(env.USAGE_ESTIMATE_OUTPUT_TOKENS),
            "USAGE_ESTIMATE_OUTPUT_TOKENS"
        );
    }
    if (env.USAGE_ESTIMATE_OUTPUT_TOKENS_BY_MODEL) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(env.USAGE_ESTIMATE_OUTPUT_TOKENS_BY_MODEL);
        } catch {
            throw new Error(
                "USAGE_ESTIMATE_OUTPUT_TOKENS_BY_MODEL must be a JSON object"
            );
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error(
                "USAGE_ESTIMATE_OUTPUT_TOKENS_BY_MODEL must be a JSON object"
            );
        }
        const byModel: Record<string, number> = {};
        for (const [alias, tokens] of Object.entries(parsed)) {
            byModel[alias] = nonNegativeInteger(
                tokens,
                `USAGE_ESTIMATE_OUTPUT_TOKENS_BY_MODEL[${JSON.stringify(
                    alias
                )}]`
            );
        }
        config.outputTokensByModel = byModel;
    }
    return config;
}

/** METER-3 observer buffer limits, in bytes; unset means the observer's defaults. */
export interface UsageObserverLimits {
    maxEventBytes?: number;
    maxJsonBytes?: number;
}

/**
 * Parse and validate the observer limits from environment variables (DEP-3,
 * set by Helm), at startup: an invalid limit must stop the service from
 * starting, not fail the first model request.
 */
export function parseUsageObserverLimits(
    env: NodeJS.ProcessEnv
): UsageObserverLimits {
    const limits: UsageObserverLimits = {};
    for (const [name, key] of [
        ["USAGE_OBSERVER_MAX_EVENT_BYTES", "maxEventBytes"],
        ["USAGE_OBSERVER_MAX_JSON_BYTES", "maxJsonBytes"]
    ] as const) {
        const raw = env[name];
        if (raw === undefined || raw === "") continue;
        const value = Number(raw);
        if (!isValidObserverLimit(value)) {
            throw new Error(
                `${name} must be an integer from 1 to ${MAX_OBSERVER_LIMIT_BYTES}`
            );
        }
        limits[key] = value;
    }
    return limits;
}
