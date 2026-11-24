import { randomUUID } from "node:crypto";
import { createUsageObserver, UsageObserver } from "./usageObserver.js";
import {
    estimateTokens,
    EstimateReason,
    SettlementQuality,
    UsageEstimateConfig,
    UsageSettlement,
    UsageSink
} from "./settlement.js";

export interface RequestMeterOptions {
    /** Defaults to a random UUID. */
    requestId?: string;
    userId: string;
    modelAlias: string;
    endpoint: string;
    requestStartedAt: Date;
    /** The forwarded request body size, for the estimate (METER-4). */
    requestBodyBytes: number;
    sink: UsageSink;
    estimate: UsageEstimateConfig;
    maxEventBytes?: number;
    maxJsonBytes?: number;
}

/**
 * Meters one forwarded model request (#3838 METER-1 to METER-5).
 *
 * The proxy calls:
 * - `responseStarted` with the upstream status and content type;
 * - `write` with every upstream response chunk, while forwarding the same
 *   bytes independently;
 * - `responseEnded` at upstream EOF, or `interrupted` when the client, the
 *   upstream connection or a timeout cut the response short;
 * - `failedBeforeResponse` when the upstream request failed after it was sent
 *   but before any response arrived.
 *
 * It settles exactly once, whichever of those calls arrive and in whatever
 * order. Charging outcomes (METER-7):
 * - an upstream error answer (any non-2xx status, e.g. 4xx or 5xx) costs
 *   nothing: LiteLLM or the provider refused or failed the request, and there
 *   is no model response to charge;
 * - a 2xx response is measured from its final usage, or estimated when no
 *   valid final usage can be read (missing, malformed, oversize, an
 *   unreadable content type, or a response cut short);
 * - a request sent upstream that then fails or times out before any response
 *   is estimated: the model may still have processed it;
 * - a request that never reached the upstream (`notForwarded`) costs nothing.
 */
export default class RequestMeter {
    private observer: UsageObserver | null = null;
    private status: number | undefined;
    private unobservable = false;
    private observerFailed = false;
    private settled = false;
    readonly requestId: string;

    constructor(private readonly options: RequestMeterOptions) {
        this.requestId = options.requestId ?? randomUUID();
    }

    responseStarted(status: number, contentType: string | undefined): void {
        if (this.settled || this.status !== undefined) return;
        this.status = status;
        if (status < 200 || status >= 300) return;
        const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
        const format =
            type === "text/event-stream"
                ? "sse"
                : type === "application/json"
                ? "json"
                : undefined;
        if (!format) {
            this.unobservable = true;
            return;
        }
        try {
            this.observer = createUsageObserver({
                format,
                maxEventBytes: this.options.maxEventBytes,
                maxJsonBytes: this.options.maxJsonBytes
            });
        } catch (error) {
            this.observerFailure(error);
        }
    }

    write(chunk: Buffer): void {
        if (this.settled || !this.observer) return;
        try {
            this.observer.write(chunk);
        } catch (error) {
            this.observerFailure(error);
        }
    }

    /**
     * Metering must never stop a valid model response being forwarded: a
     * failed observer falls back to an estimated settlement (METER-4).
     */
    private observerFailure(error: unknown): void {
        this.observer = null;
        if (this.observerFailed) return;
        this.observerFailed = true;
        console.error(
            JSON.stringify({
                event: "llm-usage-observer-failed",
                modelAlias: this.options.modelAlias,
                error: error instanceof Error ? error.name : "unknown"
            })
        );
    }

    /** Upstream EOF. */
    responseEnded(): Promise<void> {
        return this.settle(false);
    }

    /** The response was cut short (client gone, upstream error, timeout). */
    interrupted(): Promise<void> {
        return this.settle(true);
    }

    /** The request never reached the upstream (e.g. connection refused): no charge. */
    notForwarded(): void {
        if (this.status === undefined) this.settled = true;
    }

    /** The upstream request failed after it was sent, with no response. */
    failedBeforeResponse(): Promise<void> {
        if (this.settled || this.status !== undefined) return Promise.resolve();
        return this.settleWith(this.estimated("interrupted", {}));
    }

    private settle(interrupted: boolean): Promise<void> {
        if (this.settled) return Promise.resolve();
        const status = this.status;
        if (status === undefined) {
            return this.failedBeforeResponse();
        }
        if (status < 200 || status >= 300) {
            // an error answer from LiteLLM or the provider: no model response to charge
            this.settled = true;
            return Promise.resolve();
        }
        if (this.observerFailed) {
            return this.settleWith(
                this.estimated("observer_error", { status })
            );
        }
        if (this.unobservable || !this.observer) {
            // a model response we can't read usage from: estimate it
            return this.settleWith(this.estimated("unobservable", { status }));
        }
        let observation;
        try {
            observation = this.observer.finish();
        } catch (error) {
            this.observerFailure(error);
            return this.settleWith(
                this.estimated("observer_error", { status })
            );
        }
        const quality: SettlementQuality = {
            status,
            format: observation.format,
            terminalSeen: observation.terminalSeen,
            malformedEvents: observation.malformedEvents,
            oversizedEvents: observation.oversizedEvents,
            unknownEventTypes: observation.unknownEventTypes,
            invalidUsageEvents: observation.invalidUsageEvents
        };
        // A non-streaming JSON body is final when it parses with usage; a
        // stream is final only after an authoritative terminal (METER-1).
        if (observation.usageFinal && observation.usage) {
            return this.settleWith({
                ...this.base(quality),
                kind: "measured",
                inputTokens: observation.usage.inputTokens,
                outputTokens: observation.usage.outputTokens
            });
        }
        return this.settleWith(
            this.estimated(
                interrupted ? "interrupted" : "missing_final_usage",
                quality
            )
        );
    }

    private base(quality: SettlementQuality) {
        return {
            requestId: this.requestId,
            userId: this.options.userId,
            modelAlias: this.options.modelAlias,
            requestStartedAt: this.options.requestStartedAt,
            endpoint: this.options.endpoint,
            quality
        };
    }

    private estimated(
        reason: EstimateReason,
        quality: SettlementQuality
    ): UsageSettlement {
        return {
            ...this.base(quality),
            kind: "estimated",
            reason,
            estimatedTokens: estimateTokens(
                this.options.requestBodyBytes,
                this.options.modelAlias,
                this.options.estimate
            )
        };
    }

    private async settleWith(settlement: UsageSettlement): Promise<void> {
        if (this.settled) return;
        this.settled = true;
        try {
            await this.options.sink.settle(settlement);
        } catch (error) {
            // Never report an uncommitted count as recorded (USE-10); the
            // ledger's own health gate (#3942) handles admission afterwards.
            console.error(
                JSON.stringify({
                    event: "llm-usage-settlement-failed",
                    requestId: settlement.requestId,
                    userId: settlement.userId,
                    modelAlias: settlement.modelAlias,
                    kind: settlement.kind,
                    error: error instanceof Error ? error.name : "unknown"
                })
            );
        }
    }
}
