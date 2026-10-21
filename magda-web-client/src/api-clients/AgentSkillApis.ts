import { config } from "../config";

function gatewayUrl(path: string): string {
    return `${config.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export const AGENT_SKILLS_URL = gatewayUrl("api/v0/agent/skills");

export type AgentSkillType = "system" | "user";

/** Published READY Agent Skill metadata from the Agent Services catalogue. */
export interface AgentSkillMetadata {
    id: string;
    name: string;
    description: string;
    type: AgentSkillType;
    // The intended user of a user publication; absent for system skills.
    userId?: string;
    ownerId: string;
    createdAt: string;
    createdBy: string;
    updatedAt: string;
    updatedBy: string;
    checksum: string;
}

/**
 * Catalogue filters, each one server-side Registry query with its own keyset
 * pagination: All = READY system + my user publications, My Skills = my READY
 * user publications, System Skills = READY system publications.
 */
export type AgentSkillFilter = "all" | "mine" | "system";

export interface AgentSkillPage {
    items: AgentSkillMetadata[];
    hasMore: boolean;
    nextPageToken?: string;
}

export class AgentSkillApiError extends Error {
    readonly status: number;
    readonly code?: string;

    constructor(message: string, status: number, code?: string) {
        super(message);
        this.name = "AgentSkillApiError";
        this.status = status;
        this.code = code;
    }
}

function requestHeaders(accept: string) {
    const headers = new Headers(config.commonFetchRequestOptions.headers);
    headers.set("Accept", accept);
    return headers;
}

async function apiError(response: Response): Promise<AgentSkillApiError> {
    let message = `Agent Skills request failed (${response.status})`;
    let code: string | undefined;
    try {
        const body = await response.json();
        if (typeof body?.error?.message === "string") {
            message = body.error.message;
        } else if (typeof body?.message === "string") {
            message = body.message;
        }
        if (typeof body?.error?.code === "string") {
            code = body.error.code;
        }
    } catch (_) {
        // Keep the status-based fallback for non-JSON responses.
    }
    return new AgentSkillApiError(message, response.status, code);
}

async function send(url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
        response = await fetch(url, {
            ...config.commonFetchRequestOptions,
            cache: "no-store",
            ...init
        });
    } catch (_) {
        throw new AgentSkillApiError(
            "Could not reach Magda. Check your connection and try again.",
            0,
            "NETWORK_ERROR"
        );
    }
    if (!response.ok) throw await apiError(response);
    return response;
}

export function agentSkillListQuery(
    filter: AgentSkillFilter,
    options: { q?: string; pageToken?: string; limit?: number } = {}
): URLSearchParams {
    const query = new URLSearchParams();
    if (filter === "mine") {
        query.set("type", "user");
        query.set("userId", "current");
    } else {
        query.set("type", filter);
    }
    query.set("limit", String(options.limit || 10));
    // Registry pagination is keyset-only: never combine with an `orderBy`.
    if (options.pageToken) query.set("pageToken", options.pageToken);
    if (options.q?.trim()) query.set("q", options.q.trim());
    return query;
}

export async function listAgentSkills(
    filter: AgentSkillFilter,
    options: { q?: string; pageToken?: string; limit?: number } = {}
): Promise<AgentSkillPage> {
    const response = await send(
        `${AGENT_SKILLS_URL}?${agentSkillListQuery(filter, options)}`,
        { method: "GET", headers: requestHeaders("application/json") }
    );
    const body = (await response.json()) as Partial<AgentSkillPage>;
    if (!Array.isArray(body?.items) || typeof body.hasMore !== "boolean") {
        throw new AgentSkillApiError(
            "Agent Skills returned an invalid catalogue response.",
            response.status
        );
    }
    return body as AgentSkillPage;
}

function archiveUrl(skill: AgentSkillMetadata) {
    return `${AGENT_SKILLS_URL}/${skill.type}/${encodeURIComponent(
        skill.id
    )}/archive`;
}

/** Download a user publication's ZIP through the authenticated API. */
export async function downloadAgentSkillArchive(
    skill: AgentSkillMetadata
): Promise<{ blob: Blob; filename: string }> {
    const response = await send(archiveUrl(skill), {
        method: "GET",
        headers: requestHeaders("application/zip")
    });
    return {
        blob: await response.blob(),
        filename: `${skill.name}.zip`
    };
}

/**
 * Replace an existing user publication's ZIP. Agent Services validates the
 * archive, the typed update permission and the immutable skill name, and the
 * `If-Match` checksum rejects the upload if the publication changed since it
 * was listed.
 */
export async function replaceAgentSkillArchive(
    skill: AgentSkillMetadata,
    archive: Blob
): Promise<AgentSkillMetadata> {
    const headers = requestHeaders("application/json");
    headers.set("Content-Type", "application/zip");
    headers.set("If-Match", `"${skill.checksum}"`);
    const response = await send(archiveUrl(skill), {
        method: "PUT",
        headers,
        body: archive
    });
    return (await response.json()) as AgentSkillMetadata;
}

/** A user-facing explanation for a failed ZIP replacement. */
export function replaceErrorMessage(error: unknown): string {
    if (!(error instanceof AgentSkillApiError)) {
        return "The skill ZIP could not be replaced. Please try again.";
    }
    switch (error.code) {
        case "INVALID_SKILL_ARCHIVE":
            return `The ZIP is not a valid Agent Skill: ${error.message}`;
        case "AGENT_SKILL_NAME_IMMUTABLE":
            return "The skill name in the uploaded SKILL.md must match this published skill. A published skill's name can't be changed; publish a new skill instead.";
        case "AGENT_SKILL_FORBIDDEN":
            return "You don't have permission to update this skill.";
        case "AGENT_SKILL_VERSION_CONFLICT":
        case "AGENT_SKILL_PRECONDITION_FAILED":
        case "AGENT_SKILL_PENDING_CONFLICT":
            return "This skill was changed elsewhere since the list was loaded. Refresh the list and try again.";
        case "AGENT_SKILL_DELETING":
        case "AGENT_SKILL_NOT_FOUND":
            return "This skill no longer exists. Refresh the list.";
        case "SKILL_ARCHIVE_TOO_LARGE":
            return "The ZIP is larger than the allowed upload size.";
        case "AGENT_SKILL_UPLOAD_BUSY":
            return "Too many uploads are in progress. Please try again shortly.";
        case "NETWORK_ERROR":
            return error.message;
    }
    if (error.status === 401) {
        return "Your session has expired. Sign in again and retry.";
    }
    if (error.status === 403) {
        return "You don't have permission to update this skill.";
    }
    if (error.status >= 500) {
        return "Magda could not store the skill right now. Please try again later.";
    }
    return error.message;
}
