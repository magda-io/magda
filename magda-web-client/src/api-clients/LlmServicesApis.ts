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
            return "LLM Services or the Authorization API is unavailable. Retry shortly.";
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

/** API-2 / LIFE-4. */
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

/** Token sums (USE-1): measured input + output, plus estimates. */
export interface UsageAmounts {
    tokens: number;
    measuredInputTokens: number;
    measuredOutputTokens: number;
    estimatedTokens: number;
    estimatedRequests: number;
}

export interface PeriodAmounts {
    allTime: UsageAmounts;
    day: UsageAmounts;
    week: UsageAmounts;
    month: UsageAmounts;
}

/** USE-8: shown as a number, Unlimited, Exhausted or No eligible model profile. */
export type RemainingQuota =
    | { status: "no_eligible_profile" }
    | { status: "unlimited" }
    | { status: "exhausted"; remainingTokens: 0 }
    | { status: "limited"; remainingTokens: number };

export type UsagePeriod = "day" | "week" | "month";

export interface ModelUsage {
    modelAlias: string;
    eligible: boolean;
    remaining: RemainingQuota;
    periodRemaining: Record<UsagePeriod, RemainingQuota>;
    usage: PeriodAmounts;
}

/** DEP-3 `noAccessHelp`: optional text and link set by the operator. */
export interface NoAccessHelp {
    text?: string;
    url?: string;
}

export interface UsageUser {
    id: string;
    /** Only when the viewer may read users (API-12). */
    displayName?: string;
    email?: string;
}

/** API-7 / API-8: a user's usage report. */
export interface UsageReport {
    user: UsageUser;
    /** The accounting time zone (USE-3). */
    timeZone: string;
    asOf: string;
    /** Local dates; the `*End` dates are exclusive. */
    periods: {
        day: string;
        weekStart: string;
        weekEnd: string;
        monthStart: string;
        monthEnd: string;
    };
    access: "administrator" | "profiles" | "none";
    totals: PeriodAmounts;
    models: ModelUsage[];
    /** Set only when the user has no eligible model. */
    noAccessHelp: NoAccessHelp | null;
}

export interface DailyUsageRow extends UsageAmounts {
    localDate: string;
    modelAlias: string;
}

/** `from` and `to` are inclusive local dates (`YYYY-MM-DD`). */
export interface UsageQuery {
    model?: string;
    from?: string;
    to?: string;
    offset?: number;
    limit?: number;
}

export interface DailyUsage {
    timeZone: string;
    items: DailyUsageRow[];
    total: number;
}

export interface UserUsageRow extends UsageAmounts {
    userId: string;
    lastUsageDate: string | null;
    user: UsageUser;
}

function usageQuery(query: UsageQuery & { q?: string }) {
    const result: Record<string, string | number> = {};
    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
            result[key] = typeof value === "string" ? value.trim() : value;
        }
    });
    return result;
}

const userUsagePath = (userId: string) =>
    `usage/users/${encodeURIComponent(userId)}`;

/** API-7: the signed-in user's own usage; never another user's. */
export async function getMyUsage(): Promise<UsageReport> {
    const response = await request("GET", "usage/me");
    return response.json();
}

/** API-7: the signed-in user's daily history. */
export async function getMyDailyUsage(
    query: UsageQuery = {}
): Promise<DailyUsage> {
    const response = await request("GET", "usage/me/daily", {
        query: usageQuery(query)
    });
    return response.json();
}

/**
 * API-8 / API-12: users with usage, most tokens first. `q` is a user ID, or a
 * name or email (found only among users the viewer may read).
 */
export async function listUserUsage(
    query: UsageQuery & { q?: string } = {}
): Promise<{ items: UserUsageRow[]; total: number }> {
    const response = await request("GET", "usage/users", {
        query: usageQuery(query)
    });
    return response.json();
}

/** API-8: another user's usage report. */
export async function getUserUsage(userId: string): Promise<UsageReport> {
    const response = await request("GET", userUsagePath(userId));
    return response.json();
}

/** API-8: another user's daily history. */
export async function getUserDailyUsage(
    userId: string,
    query: UsageQuery = {}
): Promise<DailyUsage> {
    const response = await request("GET", `${userUsagePath(userId)}/daily`, {
        query: usageQuery(query)
    });
    return response.json();
}

/** DEP-3: the operator's help for users without model access. */
export async function getNoAccessHelp(): Promise<NoAccessHelp | null> {
    const response = await request("GET", "access-help");
    return (await response.json()).noAccessHelp ?? null;
}

/** API-9: the model aliases the signed-in user can invoke. */
export async function listInvocableModels(): Promise<string[]> {
    const response = await request("GET", "v1/models");
    const body = await response.json();
    return Array.isArray(body?.data)
        ? body.data
              .map((model: any) => model?.id)
              .filter((id: unknown) => typeof id === "string")
        : [];
}

/**
 * Actionable text for a usage API error (UI doc, "States and accessibility").
 */
export function describeUsageError(error: unknown): string {
    if (error instanceof LlmServicesApiError) {
        if (error.status === 403) {
            return "You don't have permission to see other users' LLM usage. Ask your administrator for the LLM Profile Managers role.";
        }
        if (error.status === 400) {
            return `Check the filters: ${error.message}`;
        }
        if (error.status === 503 && error.code === "llm_usage_unavailable") {
            return "LLM usage accounting is temporarily unavailable. Retry shortly.";
        }
    }
    return describeLlmServicesError(error);
}
