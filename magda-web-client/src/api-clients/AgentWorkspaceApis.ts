import { config } from "../config";

function gatewayUrl(path: string): string {
    return `${config.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export const AGENT_WORKSPACE_SESSION_URL = gatewayUrl("api/v0/agent/session");
export const AGENT_WORKSPACE_RUNTIME_URL = gatewayUrl("api/v0/agent/runtime/");

export const AGENT_WORKSPACE_STATES = [
    "ABSENT",
    "ALLOCATING",
    "BOOTSTRAPPING",
    "READY",
    "SUSPENDING",
    "SUSPENDED",
    "RESUMING",
    "DELETING",
    "FAILED",
    "DEGRADED"
] as const;

export type AgentWorkspaceState = typeof AGENT_WORKSPACE_STATES[number];

export interface AgentWorkspaceStatus {
    state: AgentWorkspaceState;
    message?: string;
    retryable?: boolean;
    updatedAt?: string;
    skillSync?: {
        status: "success" | "partial" | "failed" | "notAttempted";
        attemptedAt?: string;
        completedAt?: string;
        counts?: {
            installed: number;
            updated: number;
            unchanged: number;
            removed: number;
            skipped: number;
            failed: number;
        };
        diagnosticCode?:
            | "EXEC_FAILED"
            | "TIMEOUT"
            | "INVALID_RESULT"
            | "REMOTE_SOURCE_FAILED";
        // Sanitized per-skill problems: skill name and a stable reason code.
        problems?: Array<{
            name: string;
            action: "failed" | "skipped";
            code: string;
        }>;
        problemsTruncated?: boolean;
        // A Manager-owned sync attempt is running for this Workspace.
        inProgress?: boolean;
    };
}

export type AgentWorkspaceSkillSync = NonNullable<
    AgentWorkspaceStatus["skillSync"]
>;

export interface AgentWorkspaceSkillSyncRetryResult {
    completed: boolean;
    deduplicated: boolean;
    skillSync: AgentWorkspaceSkillSync;
}

export class AgentWorkspaceApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "AgentWorkspaceApiError";
        this.status = status;
    }
}

export function isAgentWorkspaceRunning(
    state?: AgentWorkspaceState
): state is "READY" {
    return state === "READY";
}

export function isAgentWorkspacePollingState(
    state?: AgentWorkspaceState
): boolean {
    return (
        !!state &&
        [
            "ALLOCATING",
            "BOOTSTRAPPING",
            "READY",
            "SUSPENDING",
            "RESUMING",
            "DELETING"
        ].includes(state)
    );
}

export function startAgentWorkspaceStatusPolling(
    poll: () => Promise<void>,
    intervalMs: number
): () => void {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
        timeout = setTimeout(async () => {
            try {
                await poll();
            } finally {
                if (!cancelled) {
                    schedule();
                }
            }
        }, intervalMs);
    };

    schedule();
    return () => {
        cancelled = true;
        if (timeout !== undefined) {
            clearTimeout(timeout);
        }
    };
}

async function lifecycleRequest(
    method: "GET" | "POST" | "DELETE",
    suffix = ""
): Promise<AgentWorkspaceStatus> {
    const headers = new Headers(config.commonFetchRequestOptions.headers);
    headers.set("Accept", "application/json");

    const response = await fetch(`${AGENT_WORKSPACE_SESSION_URL}${suffix}`, {
        ...config.commonFetchRequestOptions,
        method,
        headers,
        cache: "no-store"
    });

    if (!response.ok) {
        let message = `Agent Workspace request failed (${response.status})`;
        try {
            const body = await response.json();
            if (typeof body?.message === "string" && body.message.trim()) {
                message = body.message;
            }
        } catch (_) {
            // Preserve the useful status-based fallback for non-JSON responses.
        }
        throw new AgentWorkspaceApiError(message, response.status);
    }

    if (response.status === 204) {
        return { state: "ABSENT" };
    }

    let body: unknown;
    try {
        body = await response.json();
    } catch (_) {
        throw new AgentWorkspaceApiError(
            "Agent Workspace returned an invalid response.",
            response.status
        );
    }

    const state = (body as AgentWorkspaceStatus | undefined)?.state;
    if (!AGENT_WORKSPACE_STATES.includes(state as AgentWorkspaceState)) {
        throw new AgentWorkspaceApiError(
            "Agent Workspace returned an unknown lifecycle state.",
            response.status
        );
    }

    return body as AgentWorkspaceStatus;
}

export function getAgentWorkspaceStatus(): Promise<AgentWorkspaceStatus> {
    return lifecycleRequest("GET");
}

export function startAgentWorkspace(): Promise<AgentWorkspaceStatus> {
    return lifecycleRequest("POST");
}

export function resumeAgentWorkspace(): Promise<AgentWorkspaceStatus> {
    return lifecycleRequest("POST", "/resume");
}

export function resetAgentWorkspace(): Promise<AgentWorkspaceStatus> {
    return lifecycleRequest("POST", "/reset");
}

export function deleteAgentWorkspace(): Promise<AgentWorkspaceStatus> {
    return lifecycleRequest("DELETE");
}

/**
 * Ask Agent Manager to run a forced skill sync in the caller's own current
 * Workspace. Call only after the user confirmed that conflicting local skill
 * edits may be replaced or removed. Sends no body: the target and the
 * outcome are decided server-side.
 */
export async function retryAgentWorkspaceSkillSync(): Promise<
    AgentWorkspaceSkillSyncRetryResult
> {
    const headers = new Headers(config.commonFetchRequestOptions.headers);
    headers.set("Accept", "application/json");
    let response: Response;
    try {
        response = await fetch(
            `${AGENT_WORKSPACE_SESSION_URL}/skill-sync/retry`,
            {
                ...config.commonFetchRequestOptions,
                method: "POST",
                headers,
                cache: "no-store"
            }
        );
    } catch (_) {
        throw new AgentWorkspaceApiError(
            "Could not reach Magda. Check your connection and try again.",
            0
        );
    }
    let body: any;
    try {
        body = await response.json();
    } catch (_) {
        body = undefined;
    }
    if (!response.ok) {
        throw new AgentWorkspaceApiError(
            typeof body?.message === "string" && body.message.trim()
                ? body.message
                : `Skill re-check failed (${response.status})`,
            response.status
        );
    }
    if (typeof body?.skillSync?.status !== "string") {
        throw new AgentWorkspaceApiError(
            "Agent Workspace returned an invalid skill sync response.",
            response.status
        );
    }
    return body as AgentWorkspaceSkillSyncRetryResult;
}
