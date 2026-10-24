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
 * user publications, System Skills = READY system publications, Shared =
 * other users' READY user publications that I can read (#3861).
 */
export type AgentSkillFilter = "all" | "mine" | "system" | "shared";

export interface AgentSkillPage {
    items: AgentSkillMetadata[];
    hasMore: boolean;
    nextPageToken?: string;
}

export class AgentSkillApiError extends Error {
    readonly status: number;
    readonly code?: string;
    /** Structured remedy data, e.g. a suggested alias on a name conflict. */
    readonly details?: Record<string, unknown>;

    constructor(
        message: string,
        status: number,
        code?: string,
        details?: Record<string, unknown>
    ) {
        super(message);
        this.name = "AgentSkillApiError";
        this.status = status;
        this.code = code;
        this.details = details;
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
    let details: Record<string, unknown> | undefined;
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
        if (
            body?.error?.details &&
            typeof body.error.details === "object" &&
            !Array.isArray(body.error.details)
        ) {
            details = body.error.details;
        }
    } catch (_) {
        // Keep the status-based fallback for non-JSON responses.
    }
    return new AgentSkillApiError(message, response.status, code, details);
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
    } else if (filter === "shared") {
        query.set("type", "user");
        query.set("userId", "!current");
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

/* ------------------------- #3861 shared installations ------------------------- */

export const AGENT_SKILL_INSTALLATIONS_URL = `${AGENT_SKILLS_URL}/installations`;

/** How the current user can see an installation's original skill. */
export type AgentSkillInstallationSource =
    | { status: "available"; skill: AgentSkillMetadata }
    | { status: "pending" }
    | { status: "unavailable" };

export interface AgentSkillInstallation {
    id: string;
    effectiveName: string;
    alias?: string;
    userId: string;
    sourceSkillId: string;
    createdAt: string;
    source: AgentSkillInstallationSource;
}

export type AgentSkillInstallationItem =
    | AgentSkillInstallation
    | { id: string; problem: "INVALID_RECORD" };

export interface AgentSkillInstallationPage {
    items: AgentSkillInstallationItem[];
    hasMore: boolean;
    nextPageToken?: string;
}

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SKILL_NAMES = ["capture-workflow", "magda-mgd"];

/** Client-side check of an installed skill name; the server re-validates. */
export function installedNameError(name: string): string | undefined {
    if (!name) return "Enter a name.";
    if (name.length > 46) return "Use at most 46 characters.";
    if (!SKILL_NAME.test(name))
        return "Use lowercase letters, digits and single hyphens, for example csv-reporter-2.";
    if (name.startsWith("system-"))
        return "Names starting with system- are reserved for system skills.";
    if (RESERVED_SKILL_NAMES.includes(name))
        return "This name is reserved for a built-in skill.";
    return undefined;
}

function jsonHeaders() {
    const headers = requestHeaders("application/json");
    headers.set("Content-Type", "application/json");
    return headers;
}

export async function listAgentSkillInstallations(
    options: { pageToken?: string; limit?: number } = {}
): Promise<AgentSkillInstallationPage> {
    const query = new URLSearchParams();
    query.set("limit", String(options.limit || 10));
    if (options.pageToken) query.set("pageToken", options.pageToken);
    const response = await send(`${AGENT_SKILL_INSTALLATIONS_URL}?${query}`, {
        method: "GET",
        headers: requestHeaders("application/json")
    });
    const body = (await response.json()) as Partial<AgentSkillInstallationPage>;
    if (!Array.isArray(body?.items) || typeof body.hasMore !== "boolean") {
        throw new AgentSkillApiError(
            "Agent Skills returned an invalid installation response.",
            response.status
        );
    }
    return body as AgentSkillInstallationPage;
}

/**
 * Every installation of the current user, for showing install status in the
 * shared catalogue. Bounded so a very large account cannot stall the page.
 */
export async function listAllAgentSkillInstallations(
    maxPages = 10
): Promise<AgentSkillInstallationItem[]> {
    const items: AgentSkillInstallationItem[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < maxPages; page += 1) {
        const result = await listAgentSkillInstallations({
            pageToken,
            limit: 100
        });
        items.push(...result.items);
        if (!result.hasMore || !result.nextPageToken) break;
        pageToken = result.nextPageToken;
    }
    return items;
}

/**
 * Install a shared user skill for the current user. The server derives the
 * recipient from the session; a name conflict is an AgentSkillApiError with
 * code AGENT_SKILL_NAME_CONFLICT and `details.suggestedAlias`.
 */
export async function installSharedAgentSkill(
    sourceSkillId: string,
    alias?: string
): Promise<AgentSkillInstallation> {
    const response = await send(AGENT_SKILL_INSTALLATIONS_URL, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
            sourceSkillId,
            ...(alias ? { alias } : {})
        })
    });
    return (await response.json()) as AgentSkillInstallation;
}

/** Remove only the current user's installation record. */
export async function uninstallAgentSkill(installationId: string) {
    await send(
        `${AGENT_SKILL_INSTALLATIONS_URL}/${encodeURIComponent(
            installationId
        )}`,
        { method: "DELETE", headers: requestHeaders("application/json") }
    );
}

/* ------------------------------ #3861 source access ----------------------------- */

export interface AgentSkillAccess {
    id: string;
    type: AgentSkillType;
    /** System skills: available to users with a public-capable read grant. */
    public?: boolean;
    orgUnitId?: string;
    recipients: { count: number };
}

export interface AgentSkillRecipient {
    id: string;
    displayName?: string;
}

function accessUrl(skill: Pick<AgentSkillMetadata, "type" | "id">) {
    return `${AGENT_SKILLS_URL}/${skill.type}/${encodeURIComponent(
        skill.id
    )}/access`;
}

export async function getAgentSkillAccess(
    skill: Pick<AgentSkillMetadata, "type" | "id">
): Promise<AgentSkillAccess> {
    const response = await send(accessUrl(skill), {
        method: "GET",
        headers: requestHeaders("application/json")
    });
    return (await response.json()) as AgentSkillAccess;
}

/** System skills only: Public skill and one OrgUnit (null clears it). */
export async function updateAgentSkillAccess(
    skill: Pick<AgentSkillMetadata, "type" | "id">,
    settings: { public?: boolean; orgUnitId?: string | null }
): Promise<AgentSkillAccess> {
    const response = await send(accessUrl(skill), {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify(settings)
    });
    return (await response.json()) as AgentSkillAccess;
}

export async function listAgentSkillRecipients(
    skill: Pick<AgentSkillMetadata, "type" | "id">,
    options: { offset?: number; limit?: number; keyword?: string } = {}
): Promise<{ items: AgentSkillRecipient[]; total: number }> {
    const query = new URLSearchParams();
    query.set("offset", String(options.offset || 0));
    query.set("limit", String(options.limit || 10));
    if (options.keyword?.trim()) query.set("keyword", options.keyword.trim());
    const response = await send(`${accessUrl(skill)}/users?${query}`, {
        method: "GET",
        headers: requestHeaders("application/json")
    });
    return await response.json();
}

export async function addAgentSkillRecipient(
    skill: Pick<AgentSkillMetadata, "type" | "id">,
    userId: string
): Promise<{ added: boolean }> {
    const response = await send(
        `${accessUrl(skill)}/users/${encodeURIComponent(userId)}`,
        { method: "PUT", headers: requestHeaders("application/json") }
    );
    return await response.json();
}

export async function removeAgentSkillRecipient(
    skill: Pick<AgentSkillMetadata, "type" | "id">,
    userId: string
): Promise<{ removed: boolean }> {
    const response = await send(
        `${accessUrl(skill)}/users/${encodeURIComponent(userId)}`,
        { method: "DELETE", headers: requestHeaders("application/json") }
    );
    return await response.json();
}

/** A user-facing explanation for a failed install, uninstall or share. */
export function sharingErrorMessage(error: unknown): string {
    if (!(error instanceof AgentSkillApiError)) {
        return "The request could not be completed. Please try again.";
    }
    switch (error.code) {
        case "AGENT_SKILL_SOURCE_NOT_FOUND":
            return "This skill is no longer shared with you, or it was deleted. Refresh the list.";
        case "AGENT_SKILL_SOURCE_PENDING":
            return "The publisher is updating this skill right now. Try again shortly.";
        case "AGENT_SKILL_INSTALL_FORBIDDEN":
            return "You don't have permission to install shared skills. Ask your Magda administrator.";
        case "AGENT_SKILL_UNINSTALL_FORBIDDEN":
            return "You don't have permission to uninstall shared skills. Ask your Magda administrator.";
        case "AGENT_SKILL_INSTALLATION_NOT_FOUND":
            return "This installation no longer exists. Refresh the list.";
        case "INVALID_ALIAS":
            return error.message;
        case "INVALID_RECIPIENT":
            return "Enter the recipient's Magda user ID (shown on their Account page). You can't share a skill with its own user.";
        case "RECIPIENT_NOT_FOUND":
            return "No Magda user has this ID. Check the ID on the recipient's Account page.";
        case "AGENT_SKILL_SHARE_INVALID":
            return "This skill's sharing settings need attention from a Magda administrator.";
        case "AGENT_SKILL_SHARE_LIMIT_REACHED":
            return `This skill is already shared with the maximum of ${
                typeof error.details?.limit === "number"
                    ? error.details.limit
                    : 500
            } users. Remove a recipient before adding another.`;
        case "INVALID_ORG_UNIT":
            return "The selected organisation no longer exists.";
        case "AGENT_SKILL_NOT_FOUND":
            return "You can't manage access to this skill, or it no longer exists.";
        case "NETWORK_ERROR":
            return error.message;
    }
    if (error.status === 401) {
        return "Your session has expired. Sign in again and retry.";
    }
    if (error.status === 403) {
        return "You don't have permission to do this.";
    }
    if (error.status >= 500) {
        return "Magda couldn't complete this right now. Please try again later.";
    }
    return error.message;
}
