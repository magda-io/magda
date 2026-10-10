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
}

export class AgentWorkspaceApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "AgentWorkspaceApiError";
        this.status = status;
    }
}

export function isAgentWorkspacePollingState(
    state?: AgentWorkspaceState
): boolean {
    return (
        !!state &&
        [
            "ALLOCATING",
            "BOOTSTRAPPING",
            "SUSPENDING",
            "RESUMING",
            "DELETING"
        ].includes(state)
    );
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
