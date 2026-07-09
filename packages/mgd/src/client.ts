import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { MgdApiError, UsageError } from "./errors.js";
import { loadConfig, resolveProfile, Profile } from "./profile.js";
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
                if (e instanceof MgdApiError) throw e;
                lastError = e;
                if (attempt === maxAttempts - 1) break;
            }
        }
        if (lastError instanceof MgdApiError) throw lastError;
        throw new MgdApiError(
            `Request failed: ${
                lastError instanceof Error ? lastError.message : lastError
            }`,
            0,
            "network-error",
            "Check the site URL and your network connection."
        );
    }

    async json<T = unknown>(
        method: string,
        path: string,
        opts: RequestOptions = {}
    ): Promise<T> {
        const res = await this.request(method, path, opts);
        return (await res.json()) as T;
    }
}

async function toApiError(res: Response): Promise<MgdApiError> {
    let message = `${res.status} ${res.statusText}`;
    try {
        const text = await res.text();
        try {
            const parsed = JSON.parse(text);
            message = parsed?.message || parsed?.errorMessage || message;
        } catch {
            if (text.trim()) message = text.trim().slice(0, 500);
        }
    } catch {
        // keep default message
    }
    return new MgdApiError(message, res.status, codeForStatus(res.status));
}

export async function clientFromProfile(): Promise<MagdaClient> {
    const cfg = await loadConfig();
    const { profile } = resolveProfile(cfg);
    if (!profile?.baseUrl) {
        throw new UsageError(
            "No active profile. Run `mgd auth login` or set MGD_BASE_URL."
        );
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
