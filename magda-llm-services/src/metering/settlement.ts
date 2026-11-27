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
    requestBodyBytes?: number;
    outputBytes?: number;
    outputObserved?: boolean;
    doneMarkers?: number;
    terminalType?:
        | "chat"
        | "response.completed"
        | "response.failed"
        | "response.incomplete";
    responseStatus?:
        | "completed"
        | "failed"
        | "incomplete"
        | "in_progress"
        | "queued";
    completedNormally?: boolean;
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
    /** Request body bytes per estimated input token (default 6; JSON-heavy DSH evidence). */
    bytesPerToken: number;
    /** Fallback output tokens when visible output could not be observed. */
    outputTokens: number;
    /** Optional per-alias override of the fallback output tokens. */
    outputTokensByModel: Readonly<Record<string, number>>;
    /** Hidden/reasoning allowance added to observed output (default 256). */
    outputAllowanceTokens: number;
    /** Discount on unobserved input + allowance for incomplete attempts (default 0.25). */
    incompleteFactor: number;
}

export const DEFAULT_USAGE_ESTIMATE: UsageEstimateConfig = {
    bytesPerToken: 6,
    outputTokens: 4096,
    outputTokensByModel: {},
    outputAllowanceTokens: 256,
    incompleteFactor: 0.25
};

/**
 * METER-4: observed output is never discounted. Input and hidden/fallback
 * output are discounted for incomplete attempts. This is a configurable PoC
 * heuristic, not a tokenizer or provider billing reconciliation.
 */
export function estimateTokens(
    requestBodyBytes: number,
    modelAlias: string,
    config: UsageEstimateConfig = DEFAULT_USAGE_ESTIMATE,
    observation: {
        outputBytes?: number;
        outputObserved?: boolean;
        completedNormally?: boolean;
    } = {}
): number {
    const output = Object.prototype.hasOwnProperty.call(
        config.outputTokensByModel,
        modelAlias
    )
        ? config.outputTokensByModel[modelAlias]
        : config.outputTokens;
    const visible = observation.outputObserved
        ? Math.ceil((observation.outputBytes ?? 0) / config.bytesPerToken)
        : 0;
    const allowance = observation.outputObserved
        ? config.outputAllowanceTokens
        : output;
    const factor =
        observation.completedNormally === false ? config.incompleteFactor : 1;
    return Math.min(
        Number.MAX_SAFE_INTEGER,
        visible +
            Math.ceil(
                (Math.ceil(requestBodyBytes / config.bytesPerToken) +
                    allowance) *
                    factor
            )
    );
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
        outputTokensByModel: {},
        outputAllowanceTokens: DEFAULT_USAGE_ESTIMATE.outputAllowanceTokens,
        incompleteFactor: DEFAULT_USAGE_ESTIMATE.incompleteFactor
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
    if (env.USAGE_ESTIMATE_OUTPUT_ALLOWANCE_TOKENS) {
        config.outputAllowanceTokens = nonNegativeInteger(
            Number(env.USAGE_ESTIMATE_OUTPUT_ALLOWANCE_TOKENS),
            "USAGE_ESTIMATE_OUTPUT_ALLOWANCE_TOKENS"
        );
    }
    if (env.USAGE_ESTIMATE_INCOMPLETE_FACTOR) {
        const factor = Number(env.USAGE_ESTIMATE_INCOMPLETE_FACTOR);
        if (!Number.isFinite(factor) || factor < 0 || factor > 1) {
            throw new Error(
                "USAGE_ESTIMATE_INCOMPLETE_FACTOR must be between 0 and 1"
            );
        }
        config.incompleteFactor = factor;
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
