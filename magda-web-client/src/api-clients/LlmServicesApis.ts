import { config } from "../config";

/**
 * Client for the LLM Services profile management API (#3838 API-1 to API-6).
 * The Gateway exposes LLM Services' `/v0/*` as `/api/v0/llm/*`. Every
 * response is user-specific (`Cache-Control: private, no-store`), so requests
 * never use the browser cache.
 */
export const LLM_SERVICES_API_URL = `${config.baseUrl.replace(
    /\/+$/,
    ""
)}/api/v0/llm/`;

/** The exclusive "all available models" sentinel (DATA-2). */
export const ALL_MODELS = "*";

export interface AccessProfile {
    id: string;
    name: string;
    description: string | null;
    /** Exact model aliases, or exactly `["*"]`. */
    allowedModels: string[];
    enabled: boolean;
    /** Audience org unit (AUTH-5); `null` means no org unit. */
    orgUnitId: string | null;
    /** The **Public** switch (AUTH-6). */
    constraintExemption: boolean;
    usePermissionId: string;
    /** Tokens per user and per model; `null` means unlimited, `0` blocks. */
    allowedDailyTokens: number | null;
    allowedWeeklyTokens: number | null;
    allowedMonthlyTokens: number | null;
    revision: number;
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
}

/** The fields a profile manager sets on create and on a full update. */
export type AccessProfileFields = Pick<
    AccessProfile,
    | "name"
    | "description"
    | "allowedModels"
    | "enabled"
    | "orgUnitId"
    | "constraintExemption"
    | "allowedDailyTokens"
    | "allowedWeeklyTokens"
    | "allowedMonthlyTokens"
>;

export interface AccessProfileRole {
    id: string;
    name: string;
    description: string | null;
}

export interface AvailableModels {
    items: string[];
    /** `false` when LiteLLM's served list couldn't be read. */
    servedListAvailable: boolean;
}

export class LlmServicesApiError extends Error {
    readonly status: number;
    readonly code?: string;
    /** For `409 llm_profile_stale_revision`. */
    readonly currentRevision?: number;

    constructor(
        message: string,
        status: number,
        code?: string,
        currentRevision?: number
    ) {
        super(message);
        this.name = "LlmServicesApiError";
        this.status = status;
        this.code = code;
        this.currentRevision = currentRevision;
    }
}

export function isStaleRevisionError(error: unknown): boolean {
    return (
        error instanceof LlmServicesApiError &&
        error.status === 409 &&
        error.code === "llm_profile_stale_revision"
    );
}

/**
 * Actionable text for an API error, by status (UI doc, "States and
 * accessibility"). The server's own message is kept for validation errors,
 * because it names the field.
 */
export function describeLlmServicesError(error: unknown): string {
    if (!(error instanceof LlmServicesApiError)) {
        return `Unable to reach LLM Services. Check your connection and retry. (${error})`;
    }
    switch (error.status) {
        case 401:
            return "Your session has expired. Sign in again and retry.";
        case 403:
            return "You don't have permission to do this. Ask your administrator for the LLM Profile Managers role.";
        case 404:
            return "This profile or role no longer exists. Go back to the list and reload it.";
        case 409:
            return "This profile was changed by someone else. Reload to see the changes.";
        case 422:
            return `The change was rejected: ${error.message}`;
        case 429:
            return "Too many requests. Wait a moment, then retry.";
        case 502:
            return "The Authorization API refused the change. Retry, and contact your administrator if it keeps failing.";
        case 503:
            return "LLM Services or the Authorization API is unavailable. Nothing was changed; retry shortly.";
        default:
            return `The request failed (${error.status}): ${error.message}`;
    }
}

function url(path: string, query?: Record<string, string | number>) {
    const target = new URL(
        path.replace(/^\/+/, ""),
        new URL(LLM_SERVICES_API_URL, window.location.href)
    );
    Object.entries(query || {}).forEach(([key, value]) => {
        if (value !== "" && value !== undefined) {
            target.searchParams.set(key, String(value));
        }
    });
    return target.toString();
}

async function request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    options: {
        query?: Record<string, string | number>;
        body?: unknown;
        headers?: Record<string, string>;
    } = {}
): Promise<Response> {
    const headers = new Headers(config.commonFetchRequestOptions?.headers);
    headers.set("Accept", "application/json");
    Object.entries(options.headers || {}).forEach(([key, value]) =>
        headers.set(key, value)
    );
    let body: string | undefined;
    if (options.body !== undefined) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(options.body);
    }
    const response = await fetch(url(path, options.query), {
        ...config.commonFetchRequestOptions,
        method,
        headers,
        body,
        cache: "no-store"
    });
    if (!response.ok) {
        let message = `LLM Services request failed (${response.status})`;
        let code: string | undefined;
        let currentRevision: number | undefined;
        try {
            const data = await response.json();
            const error = data?.error;
            if (typeof error?.message === "string" && error.message.trim()) {
                message = error.message;
            }
            if (typeof error?.code === "string") {
                code = error.code;
            }
            if (typeof error?.currentRevision === "number") {
                currentRevision = error.currentRevision;
            }
        } catch (_) {
            // not a JSON error body (e.g. from the Gateway)
        }
        throw new LlmServicesApiError(
            message,
            response.status,
            code,
            currentRevision
        );
    }
    return response;
}

const profilePath = (id: string) => `access-profiles/${encodeURIComponent(id)}`;

/** API-1: list and search by name. */
export async function listAccessProfiles(
    query: { q?: string; offset?: number; limit?: number } = {}
): Promise<{ items: AccessProfile[]; total: number }> {
    const response = await request("GET", "access-profiles", {
        query: {
            q: query.q?.trim() || "",
            offset: query.offset ?? 0,
            limit: query.limit ?? 10
        }
    });
    return response.json();
}

/** API-1: read one profile. Its `revision` is the value to send as `If-Match`. */
export async function getAccessProfile(id: string): Promise<AccessProfile> {
    const response = await request("GET", profilePath(id));
    return response.json();
}

/** API-2 / LIFE-1. */
export async function createAccessProfile(
    fields: AccessProfileFields
): Promise<AccessProfile> {
    const response = await request("POST", "access-profiles", {
        body: fields
    });
    return response.json();
}

/**
 * API-2 / LIFE-2: a full update. A stale `revision` fails with
 * `409 llm_profile_stale_revision` (see `isStaleRevisionError`).
 */
export async function updateAccessProfile(
    id: string,
    revision: number,
    fields: AccessProfileFields
): Promise<AccessProfile> {
    const response = await request("PUT", profilePath(id), {
        body: fields,
        headers: { "If-Match": `"${revision}"` }
    });
    return response.json();
}

/** API-2 / LIFE-4. A failure leaves the profile unchanged. */
export async function deleteAccessProfile(id: string): Promise<void> {
    await request("DELETE", profilePath(id));
}

/** API-3: the roles holding the profile's Use permission. */
export async function listAccessProfileRoles(
    id: string,
    query: { offset?: number; limit?: number } = {}
): Promise<AccessProfileRole[]> {
    const response = await request("GET", `${profilePath(id)}/roles`, {
        query: { offset: query.offset ?? 0, limit: query.limit ?? 100 }
    });
    return (await response.json()).items;
}

/**
 * API-4: roles that can be attached. The server never offers Anonymous
 * Users, Admin Users or roles already attached.
 */
export async function listAccessProfileRoleCandidates(
    id: string,
    query: { q?: string; limit?: number } = {}
): Promise<AccessProfileRole[]> {
    const response = await request(
        "GET",
        `${profilePath(id)}/role-candidates`,
        { query: { q: query.q?.trim() || "", limit: query.limit ?? 20 } }
    );
    return (await response.json()).items;
}

/** API-5 / LIFE-3: give a role's users access to the profile. */
export async function attachAccessProfileRole(
    id: string,
    roleId: string
): Promise<void> {
    await request(
        "PUT",
        `${profilePath(id)}/roles/${encodeURIComponent(roleId)}`
    );
}

/** API-5 / LIFE-3: remove only this profile's access from the role. */
export async function detachAccessProfileRole(
    id: string,
    roleId: string
): Promise<void> {
    await request(
        "DELETE",
        `${profilePath(id)}/roles/${encodeURIComponent(roleId)}`
    );
}

/** API-6: aliases the profile form can offer. */
export async function getAvailableModels(): Promise<AvailableModels> {
    const response = await request("GET", "available-models");
    return response.json();
}
