/**
 * Disposable #3934 PoC only. No production imports, logging, stream ownership,
 * provider text, identifiers or errors. Call write with the original bytes and
 * forward those bytes independently; finish observes EOF, not cancellation intent.
 *
 * Memory is O(configured limit), not O(stream length): an oversized SSE event is
 * discarded through its next blank line; an oversized JSON body is discarded to
 * EOF. JSON.parse's transient allocations are bounded by the same input limit.
 */
export interface UsageObserverOptions {
    format: "sse" | "json";
    maxEventBytes?: number;
    maxJsonBytes?: number;
}

export interface ObservedUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    /** Subsets of output/input respectively; never added to totals. */
    reasoningTokens?: number;
    cachedInputTokens?: number;
}

const allowedEventTypes = [
    "chat.completion",
    "chat.completion.chunk",
    "response",
    "response.created",
    "response.content_part.added",
    "response.content_part.done",
    "response.in_progress",
    "response.output_text.delta",
    "response.output_text.done",
    "response.output_item.added",
    "response.output_item.done",
    "response.function_call_arguments.delta",
    "response.function_call_arguments.done",
    "response.completed",
    "response.failed",
    "response.incomplete",
    "error"
] as const;

type AllowedEventType = typeof allowedEventTypes[number];
const allowedTypes = new Set<string>(allowedEventTypes);
const terminalTypes = new Set([
    "response.completed",
    "response.failed",
    "response.incomplete"
]);

export interface UsageObservation {
    format: "sse" | "json";
    bytesObserved: number;
    eventsSeen: number;
    eventTypes: Partial<Record<AllowedEventType, number>>;
    unknownEventTypes: number;
    malformedEvents: number;
    oversizedEvents: number;
    incompleteEvents: number;
    usageEvents: number;
    duplicateUsageEvents: number;
    invalidUsageEvents: number;
    terminalEvents: number;
    terminalSeen: boolean;
    /** Only true after finish; EOF alone is not a provider terminal marker. */
    missingTerminal: boolean;
    finished: boolean;
    peakBufferedBytes: number;
    /** False for interim/unknown-envelope usage or a terminal without final usage. */
    usageFinal: boolean;
    usage?: ObservedUsage;
}

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | undefined =>
    value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as JsonObject)
        : undefined;
const tokenCount = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const increment = (value: number, amount = 1) =>
    Math.min(Number.MAX_SAFE_INTEGER, value + amount);

function limit(value: number | undefined, fallback: number): number {
    const result = value ?? fallback;
    // An accidental unbounded configuration should fail before reading anything.
    if (
        !Number.isSafeInteger(result) ||
        result < 1 ||
        result > 16 * 1024 * 1024
    ) {
        throw new RangeError(
            "Observer limit must be an integer from 1 to 16777216"
        );
    }
    return result;
}

export function createUsageObserver(
    options: UsageObserverOptions
): UsageObserver {
    return new UsageObserver(options);
}

export class UsageObserver {
    private readonly buffer: Buffer;
    private readonly metadata: UsageObservation;
    private buffered = 0;
    private lineLength = 0;
    private skipLf = false;
    private oversized = false;
    private firstEvent = true;

    constructor(options: UsageObserverOptions) {
        if (options.format !== "sse" && options.format !== "json") {
            throw new TypeError("Observer format must be sse or json");
        }
        const eventLimit = limit(options.maxEventBytes, 64 * 1024);
        const jsonLimit = limit(options.maxJsonBytes, 1024 * 1024);
        this.buffer = Buffer.alloc(
            options.format === "sse" ? eventLimit : jsonLimit
        );
        this.metadata = {
            format: options.format,
            bytesObserved: 0,
            eventsSeen: 0,
            eventTypes: {},
            unknownEventTypes: 0,
            malformedEvents: 0,
            oversizedEvents: 0,
            incompleteEvents: 0,
            usageEvents: 0,
            duplicateUsageEvents: 0,
            invalidUsageEvents: 0,
            terminalEvents: 0,
            terminalSeen: false,
            missingTerminal: false,
            finished: false,
            peakBufferedBytes: 0,
            usageFinal: false
        };
    }

    /** Does not retain, mutate, emit or take ownership of the supplied Buffer. */
    write(chunk: Buffer): void {
        if (this.metadata.finished) return;
        this.metadata.bytesObserved = increment(
            this.metadata.bytesObserved,
            chunk.length
        );
        if (this.metadata.format === "json") {
            if (this.oversized) return;
            if (chunk.length > this.buffer.length - this.buffered) {
                this.discardOversized();
                return;
            }
            chunk.copy(this.buffer, this.buffered);
            this.buffered += chunk.length;
            this.recordPeak();
            return;
        }
        // Scan bytes, not decoded chunks: UTF-8 and CRLF may split anywhere.
        for (const byte of chunk) {
            if (this.skipLf) {
                this.skipLf = false;
                if (byte === 10) continue;
            }
            if (byte === 13 || byte === 10) {
                this.endLine();
                this.skipLf = byte === 13;
            } else {
                this.lineLength = 1; // Only emptiness matters; cannot overflow.
                this.append(byte);
            }
        }
    }

    /** Idempotent; drops incomplete SSE frames rather than inventing a terminal. */
    finish(): UsageObservation {
        if (!this.metadata.finished) {
            if (this.metadata.format === "json") {
                if (!this.oversized && this.buffered) {
                    this.metadata.eventsSeen = increment(
                        this.metadata.eventsSeen
                    );
                    this.parseJson(
                        this.buffer.toString("utf8", 0, this.buffered),
                        undefined,
                        true
                    );
                } else if (!this.oversized) {
                    this.metadata.incompleteEvents = increment(
                        this.metadata.incompleteEvents
                    );
                }
            } else if (this.buffered || this.oversized || this.lineLength) {
                this.metadata.incompleteEvents = increment(
                    this.metadata.incompleteEvents
                );
            }
            this.buffered = 0;
            this.buffer.fill(0);
            this.metadata.finished = true;
            this.metadata.missingTerminal = !this.metadata.terminalSeen;
        }
        return this.getMetadata();
    }

    /** A detached, metadata-only snapshot; caller mutations cannot affect state. */
    getMetadata(): UsageObservation {
        return {
            ...this.metadata,
            eventTypes: { ...this.metadata.eventTypes },
            ...(this.metadata.usage
                ? { usage: { ...this.metadata.usage } }
                : {})
        };
    }

    private recordPeak(): void {
        this.metadata.peakBufferedBytes = Math.max(
            this.metadata.peakBufferedBytes,
            this.buffered
        );
    }

    private discardOversized(): void {
        this.oversized = true;
        this.buffered = 0;
        this.buffer.fill(0);
        this.metadata.oversizedEvents = increment(
            this.metadata.oversizedEvents
        );
    }

    private append(byte: number): void {
        if (this.oversized) return;
        if (this.buffered === this.buffer.length) {
            this.discardOversized();
            return;
        }
        this.buffer[this.buffered++] = byte;
        this.recordPeak();
    }

    private endLine(): void {
        if (this.lineLength) {
            this.append(10); // Normalize CRLF/CR/LF only inside the private copy.
            this.lineLength = 0;
            return;
        }
        if (!this.oversized && this.buffered) {
            let event = this.buffer.toString("utf8", 0, this.buffered);
            if (this.firstEvent) event = event.replace(/^\uFEFF/, "");
            this.firstEvent = false;
            this.parseEvent(event);
        }
        this.buffered = 0;
        this.oversized = false;
    }

    private parseEvent(event: string): void {
        const data: string[] = [];
        let eventType: string | undefined;
        for (const line of event.split("\n")) {
            if (!line || line.startsWith(":")) continue;
            const colon = line.indexOf(":");
            const field = colon < 0 ? line : line.slice(0, colon);
            let value = colon < 0 ? "" : line.slice(colon + 1);
            if (value.startsWith(" ")) value = value.slice(1);
            if (field === "data") data.push(value);
            if (field === "event") eventType = value;
        }
        if (!data.length) return;
        this.metadata.eventsSeen = increment(this.metadata.eventsSeen);
        const payload = data.join("\n");
        if (payload.trim() === "[DONE]") {
            this.terminal(true);
            return;
        }
        this.parseJson(payload, eventType, false);
    }

    private terminal(finalUsage: boolean): void {
        this.metadata.terminalEvents = increment(this.metadata.terminalEvents);
        if (!this.metadata.terminalSeen) {
            this.metadata.usageFinal = finalUsage && !!this.metadata.usage;
        }
        this.metadata.terminalSeen = true;
    }

    private parseJson(
        payload: string,
        eventType: string | undefined,
        jsonBody: boolean
    ): void {
        let parsed: unknown;
        try {
            parsed = JSON.parse(payload);
        } catch {
            // Deliberately do not retain or emit the provider payload/exception.
            this.metadata.malformedEvents = increment(
                this.metadata.malformedEvents
            );
            return;
        }
        const root = object(parsed);
        if (!root) return;
        const type =
            eventType ||
            (typeof root.type === "string" ? root.type : undefined) ||
            (typeof root.object === "string" ? root.object : undefined);
        if (type) {
            if (allowedTypes.has(type)) {
                const key = type as AllowedEventType;
                this.metadata.eventTypes[key] = increment(
                    this.metadata.eventTypes[key] ?? 0
                );
            } else {
                this.metadata.unknownEventTypes = increment(
                    this.metadata.unknownEventTypes
                );
            }
        }
        const response = object(root.response);
        const terminalStatus =
            root.status === "completed" ||
            root.status === "failed" ||
            root.status === "incomplete";
        const knownJsonTerminal =
            root.object === "chat.completion" ||
            ((root.object === "response" || root.type === "response") &&
                terminalStatus);
        const isTerminal =
            !!(type && terminalTypes.has(type)) ||
            (jsonBody && knownJsonTerminal);
        const validUsage = this.observeUsage(response?.usage ?? root.usage);
        // Chat finish_reason ends generation, not the stream: usage may follow.
        // Only [DONE] is a terminal marker for streaming Chat responses. Unknown
        // JSON envelopes and queued/in_progress responses are not terminal.
        if (isTerminal) this.terminal(validUsage);
    }

    private observeUsage(rawUsage: unknown): boolean {
        if (rawUsage === undefined || rawUsage === null) return false;
        const usage = object(rawUsage);
        const chat =
            usage && ("prompt_tokens" in usage || "completion_tokens" in usage);
        const input = usage?.[chat ? "prompt_tokens" : "input_tokens"];
        const output = usage?.[chat ? "completion_tokens" : "output_tokens"];
        const sum =
            tokenCount(input) && tokenCount(output) ? input + output : NaN;
        const total =
            usage?.total_tokens === undefined ? sum : usage.total_tokens;
        if (
            !tokenCount(input) ||
            !tokenCount(output) ||
            !tokenCount(sum) ||
            !tokenCount(total) ||
            total !== sum
        ) {
            this.metadata.invalidUsageEvents = increment(
                this.metadata.invalidUsageEvents
            );
            return false;
        }
        const valid: ObservedUsage = {
            inputTokens: input,
            outputTokens: output,
            totalTokens: total
        };
        const reasoning = object(
            usage?.[
                chat ? "completion_tokens_details" : "output_tokens_details"
            ]
        )?.reasoning_tokens;
        const cached = object(
            usage?.[chat ? "prompt_tokens_details" : "input_tokens_details"]
        )?.cached_tokens;
        if (tokenCount(reasoning) && reasoning <= output)
            valid.reasoningTokens = reasoning;
        if (tokenCount(cached) && cached <= input)
            valid.cachedInputTokens = cached;
        this.metadata.usageEvents = increment(this.metadata.usageEvents);
        // Usage values are snapshots, not deltas. Keep the latest validated
        // snapshot until terminal (including replacement of interim zeros), then
        // freeze it. Later conflicting frames cannot overwrite final accounting.
        if (
            this.metadata.usage &&
            JSON.stringify(this.metadata.usage) === JSON.stringify(valid)
        ) {
            this.metadata.duplicateUsageEvents = increment(
                this.metadata.duplicateUsageEvents
            );
        }
        if (!this.metadata.terminalSeen) this.metadata.usage = valid;
        // A terminal without usage retains any interim snapshot as provisional
        // (usageFinal=false); subsequent out-of-order frames cannot promote it.
        return true;
    }
}
