import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { MgdApiError, MutationOutcome } from "./errors.js";
import {
    loadConfig,
    resolveProfile,
    noProfileError,
    Profile
} from "./profile.js";
import { VERSION } from "./version.js";

export interface ClientOptions {
    baseUrl: string;
    apiKeyId?: string;
    apiKey?: string;
}

export interface RequestOptions {
    query?:
        | Record<string, string | number | boolean | undefined>
        | [string, string][];
    headers?: Record<string, string>;
    body?: BodyInit;
    retry?: boolean;
    retryDelayMs?: number;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Failures while establishing the connection or TLS session: the request
// itself never reached the server.
const NOT_SENT_CODES = new Set([
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "EADDRNOTAVAIL",
    "UND_ERR_CONNECT_TIMEOUT",
    "CERT_HAS_EXPIRED",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "ERR_TLS_CERT_ALTNAME_INVALID"
]);

function errorCodes(error: unknown): string[] {
    const codes: string[] = [];
    for (let e = error as any, depth = 0; e && depth < 5; depth++) {
        if (typeof e.code === "string") codes.push(e.code);
        e = e.cause;
    }
    return codes;
}

/** A server error on a write may follow a partial commit. */
function serverErrorOutcome(method: string, error: MgdApiError): MgdApiError {
    if (!MUTATING.has(method) || error.status < 500) return error;
    return new MgdApiError(
        error.message,
        error.status,
        error.code,
        error.hint,
        "unknown"
    );
}

/** Classify a transport failure of a mutating request. */
export function transportOutcome(error: unknown): MutationOutcome {
    return errorCodes(error).some((code) => NOT_SENT_CODES.has(code))
        ? "not-sent"
        : "unknown";
}

function codeForStatus(status: number): string {
    if (status === 401) return "unauthorized";
    if (status === 403) return "forbidden";
    if (status === 404) return "not-found";
    if (status >= 500) return "server-error";
    return "request-failed";
}

export class MagdaClient {
    readonly invocationId = randomUUID();

    constructor(readonly opts: ClientOptions) {}

    buildUrl(path: string, query?: RequestOptions["query"]): string {
        const url = new URL(this.opts.baseUrl.replace(/\/+$/, "") + path);
        const entries = Array.isArray(query)
            ? query
            : Object.entries(query ?? {}).filter(([, v]) => v !== undefined);
        for (const [k, v] of entries) {
            url.searchParams.append(k, String(v));
        }
        return url.toString();
    }

    async request(
        method: string,
        path: string,
        opts: RequestOptions = {}
    ): Promise<Response> {
        const url = this.buildUrl(path, opts.query);
        const headers: Record<string, string> = {
            "user-agent": `mgd/${VERSION}`,
            ...opts.headers
        };
        if (this.opts.apiKeyId && this.opts.apiKey) {
            headers["X-Magda-API-Key-Id"] = this.opts.apiKeyId;
            headers["X-Magda-API-Key"] = this.opts.apiKey;
        }
        if (MUTATING.has(method)) {
            headers["X-Magda-Client-Id"] = "mgd";
            headers["X-Magda-Client-Invocation-Id"] = this.invocationId;
        }
        const shouldRetry =
            opts.retry ?? (method === "GET" || method === "HEAD");
        const maxAttempts = shouldRetry && !MUTATING.has(method) ? 3 : 1;
        const baseDelay = opts.retryDelayMs ?? 300;

        let lastError: unknown;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (attempt > 0) await sleep(baseDelay * 2 ** (attempt - 1));
            try {
                const res = await fetch(url, {
                    method,
                    headers,
                    body: opts.body
                });
                if (res.status >= 500 && attempt < maxAttempts - 1) {
                    lastError = await toApiError(res);
                    continue;
                }
                if (!res.ok) throw await toApiError(res);
                return res;
            } catch (e) {
                if (e instanceof MgdApiError)
                    throw serverErrorOutcome(method, e);
                lastError = e;
                if (attempt === maxAttempts - 1) break;
            }
        }
        if (lastError instanceof MgdApiError)
            throw serverErrorOutcome(method, lastError);
        const detail = errorCodes(lastError)
            .filter((code) => code !== "UND_ERR")
            .slice(-1)[0];
        throw new MgdApiError(
            `Request failed: ${
                lastError instanceof Error ? lastError.message : lastError
            }${detail ? ` (${detail})` : ""}`,
            0,
            "network-error",
            "Check the site URL and your network connection.",
            MUTATING.has(method) ? transportOutcome(lastError) : undefined
        );
    }

    async json<T = unknown>(
        method: string,
        path: string,
        opts: RequestOptions = {}
    ): Promise<T> {
        const res = await this.request(method, path, opts);
        try {
            return (await res.json()) as T;
        } catch (error) {
            if (!MUTATING.has(method)) throw error;
            // The server accepted the write but its response was lost.
            throw new MgdApiError(
                `The server accepted the request (HTTP ${
                    res.status
                }) but its response could not be read: ${
                    (error as Error).message
                }`,
                res.status,
                "response-unreadable",
                undefined,
                "unknown"
            );
        }
    }
}

async function toApiError(res: Response): Promise<MgdApiError> {
    let message = `${res.status} ${res.statusText}`;
    let serverCode: string | undefined;
    let serverDetails: Record<string, unknown> | undefined;
    try {
        const text = await res.text();
        try {
            const parsed = JSON.parse(text);
            message =
                parsed?.error?.message ||
                parsed?.message ||
                parsed?.errorMessage ||
                message;
            serverCode =
                typeof parsed?.error?.code === "string"
                    ? parsed.error.code
                    : undefined;
            // Structured remedy data, e.g. a suggested alias.
            if (
                parsed?.error?.details &&
                typeof parsed.error.details === "object" &&
                !Array.isArray(parsed.error.details)
            )
                serverDetails = parsed.error.details;
        } catch {
            if (text.trim()) message = text.trim().slice(0, 500);
        }
    } catch {
        // keep default message
    }
    return new MgdApiError(
        message,
        res.status,
        serverCode || codeForStatus(res.status),
        undefined,
        undefined,
        serverDetails ? { server: serverDetails } : undefined
    );
}

export async function clientFromProfile(): Promise<MagdaClient> {
    const cfg = await loadConfig();
    const { profile } = resolveProfile(cfg);
    if (!profile?.baseUrl) {
        throw noProfileError(cfg);
    }
    return clientFor(profile);
}

export function clientFor(profile: Profile): MagdaClient {
    return new MagdaClient({
        baseUrl: profile.baseUrl,
        apiKeyId: profile.apiKeyId,
        apiKey: profile.apiKey
    });
}

// Registry mutation responses carry the id of the event they created in the
// `x-magda-event-id` header (same contract as the web client's
// getEventIdFromHeaders). 0 means "unknown" and must never be written into
// a version item.
export function eventIdFrom(res: Response): number {
    const v = res.headers.get("x-magda-event-id");
    if (!v) return 0;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? 0 : n;
}
