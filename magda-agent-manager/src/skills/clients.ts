import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import { isTrueEquivalent } from "magda-typescript-common/src/opa/AuthDecision.js";
import {
    AgentSkillAuthorization,
    AgentSkillInstallationAuthorization,
    AgentSkillInstallationRecord,
    AgentSkillInstallationRegistry,
    AgentSkillRecord,
    AgentSkillRecordOccupant,
    AgentSkillRegistry,
    AgentSkillShareGroup,
    AgentSkillShareGroups,
    AgentSkillShareRecipient,
    AgentSkillStorage,
    DownloadedArchive,
    RegistryListOptions,
    RegistryRecordsPage,
    StoredArchiveIdentity
} from "./types.js";

const INSTALLATION_ASPECT = "agent-skill-installation";

export class DownstreamServiceError extends Error {
    constructor(
        public readonly service: "authorization" | "registry" | "storage",
        public readonly status: number,
        message: string
    ) {
        super(message);
    }
}

function baseUrl(value: string): string {
    return value.replace(/\/$/, "");
}

function encodeObjectKey(key: string): string {
    return key
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
}

async function parseJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        throw new DownstreamServiceError(
            "registry",
            502,
            "Registry API returned an invalid response"
        );
    }
}

export class HttpAgentSkillRegistry
    implements AgentSkillRegistry, AgentSkillInstallationRegistry {
    private readonly url: string;

    constructor(
        registryApiUrl: string,
        private readonly tenantId: number,
        private readonly requestTimeoutMs: number = 15_000
    ) {
        this.url = baseUrl(registryApiUrl);
    }

    private headers(sessionToken: string, json = false): HeadersInit {
        return {
            "X-Magda-Session": sessionToken,
            "X-Magda-Tenant-Id": String(this.tenantId),
            ...(json ? { "Content-Type": "application/json" } : {})
        };
    }

    private async request(
        path: string,
        sessionToken: string,
        init: RequestInit = {}
    ): Promise<Response> {
        let response: Response;
        try {
            response = await fetch(`${this.url}${path}`, {
                ...init,
                headers: {
                    ...this.headers(
                        sessionToken,
                        typeof init.body === "string"
                    ),
                    ...(init.headers || {})
                },
                redirect: "error",
                signal: AbortSignal.timeout(this.requestTimeoutMs)
            });
        } catch {
            throw new DownstreamServiceError(
                "registry",
                503,
                "Registry API is unavailable"
            );
        }
        return response;
    }

    async get(id: string, sessionToken: string): Promise<unknown | undefined> {
        const query = new URLSearchParams();
        query.append("aspect", "agent-skill");
        query.append("aspect", "access-control");
        const response = await this.request(
            `/records/${encodeURIComponent(id)}?${query}`,
            sessionToken
        );
        if (response.status === 404) return undefined;
        if (!response.ok) {
            throw new DownstreamServiceError(
                "registry",
                response.status,
                "Registry API rejected the record read"
            );
        }
        return await parseJson(response);
    }

    async list(
        options: RegistryListOptions,
        sessionToken: string
    ): Promise<RegistryRecordsPage> {
        const query = new URLSearchParams();
        query.append("aspect", "agent-skill");
        query.append("aspect", "access-control");
        query.set("limit", String(options.limit));
        query.set("reversePageTokenOrder", "true");
        if (options.pageToken) query.set("pageToken", options.pageToken);
        if (options.q) query.set("q", options.q);
        if (options.type) {
            query.append("aspectQuery", `agent-skill.type:${options.type}`);
        }
        if (options.state) {
            query.append("aspectQuery", `agent-skill.state:${options.state}`);
        }
        if (options.userId) {
            query.append(
                "aspectQuery",
                `agent-skill.userId:${
                    options.userId.operator === "neq" ? "!" : ""
                }${options.userId.value}`
            );
        }
        for (const condition of options.anyOf || []) {
            query.append(
                "aspectOrQuery",
                `agent-skill.${condition.field}:${
                    condition.operator === "neq" ? "!" : ""
                }${condition.value}`
            );
        }
        const response = await this.request(
            `/records?${query.toString()}`,
            sessionToken
        );
        if (!response.ok) {
            throw new DownstreamServiceError(
                "registry",
                response.status,
                "Registry API rejected the catalogue query"
            );
        }
        const data = (await parseJson(response)) as Partial<
            RegistryRecordsPage
        >;
        if (
            !data ||
            !Array.isArray(data.records) ||
            typeof data.hasMore !== "boolean" ||
            (data.nextPageToken !== undefined &&
                typeof data.nextPageToken !== "string") ||
            (data.hasMore && !data.nextPageToken)
        ) {
            throw new DownstreamServiceError(
                "registry",
                502,
                "Registry API returned an invalid catalogue response"
            );
        }
        return {
            totalCount:
                typeof data.totalCount === "number"
                    ? data.totalCount
                    : undefined,
            hasMore: data.hasMore,
            nextPageToken: data.nextPageToken,
            records: data.records
        };
    }

    async create(
        record: AgentSkillRecord,
        sessionToken: string
    ): Promise<unknown> {
        const response = await this.request("/records", sessionToken, {
            method: "POST",
            body: JSON.stringify(record)
        });
        if (!response.ok) {
            throw new DownstreamServiceError(
                "registry",
                response.status,
                "Registry API rejected record creation"
            );
        }
        return await parseJson(response);
    }

    async put(
        record: AgentSkillRecord,
        sessionToken: string
    ): Promise<unknown> {
        const response = await this.request(
            `/records/${encodeURIComponent(record.id)}`,
            sessionToken,
            { method: "PUT", body: JSON.stringify(record) }
        );
        if (!response.ok) {
            throw new DownstreamServiceError(
                "registry",
                response.status,
                "Registry API rejected record update"
            );
        }
        return await parseJson(response);
    }

    async delete(id: string, sessionToken: string): Promise<void> {
        const response = await this.request(
            `/records/${encodeURIComponent(id)}`,
            sessionToken,
            { method: "DELETE" }
        );
        if (!response.ok && response.status !== 404) {
            throw new DownstreamServiceError(
                "registry",
                response.status,
                "Registry API rejected record deletion"
            );
        }
    }

    async getInstallation(
        id: string,
        sessionToken: string
    ): Promise<unknown | undefined> {
        const query = new URLSearchParams();
        query.append("aspect", INSTALLATION_ASPECT);
        query.append("aspect", "access-control");
        // A publication with the same ID is not an installation.
        query.append("optionalAspect", "agent-skill");
        const response = await this.request(
            `/records/${encodeURIComponent(id)}?${query}`,
            sessionToken
        );
        if (response.status === 404) return undefined;
        if (!response.ok) {
            throw new DownstreamServiceError(
                "registry",
                response.status,
                "Registry API rejected the installation read"
            );
        }
        return await parseJson(response);
    }

    async listInstallations(
        options: { userId: string; pageToken?: string; limit: number },
        sessionToken: string
    ): Promise<RegistryRecordsPage> {
        const query = new URLSearchParams();
        query.append("aspect", INSTALLATION_ASPECT);
        query.append("aspect", "access-control");
        query.append("optionalAspect", "agent-skill");
        query.set("limit", String(options.limit));
        query.set("reversePageTokenOrder", "true");
        if (options.pageToken) query.set("pageToken", options.pageToken);
        query.append(
            "aspectQuery",
            `${INSTALLATION_ASPECT}.userId:${options.userId}`
        );
        const response = await this.request(
            `/records?${query.toString()}`,
            sessionToken
        );
        if (!response.ok) {
            throw new DownstreamServiceError(
                "registry",
                response.status,
                "Registry API rejected the installation query"
            );
        }
        const data = (await parseJson(response)) as Partial<
            RegistryRecordsPage
        >;
        if (
            !data ||
            !Array.isArray(data.records) ||
            typeof data.hasMore !== "boolean" ||
            (data.nextPageToken !== undefined &&
                typeof data.nextPageToken !== "string") ||
            (data.hasMore && !data.nextPageToken)
        ) {
            throw new DownstreamServiceError(
                "registry",
                502,
                "Registry API returned an invalid installation response"
            );
        }
        return {
            hasMore: data.hasMore,
            nextPageToken: data.nextPageToken,
            records: data.records
        };
    }

    async createInstallation(
        record: AgentSkillInstallationRecord,
        sessionToken: string
    ): Promise<unknown> {
        const response = await this.request("/records", sessionToken, {
            method: "POST",
            body: JSON.stringify(record)
        });
        if (!response.ok) {
            throw new DownstreamServiceError(
                "registry",
                response.status,
                "Registry API rejected installation creation"
            );
        }
        return await parseJson(response);
    }

    async deleteInstallation(id: string, sessionToken: string): Promise<void> {
        await this.delete(id, sessionToken);
    }

    async occupant(
        id: string,
        sessionToken: string
    ): Promise<AgentSkillRecordOccupant> {
        const query = new URLSearchParams();
        query.append("optionalAspect", "agent-skill");
        query.append("optionalAspect", INSTALLATION_ASPECT);
        const response = await this.request(
            `/records/${encodeURIComponent(id)}?${query}`,
            sessionToken
        );
        if (response.status === 404) return "none";
        if (!response.ok) {
            throw new DownstreamServiceError(
                "registry",
                response.status,
                "Registry API rejected the record read"
            );
        }
        const record = (await parseJson(response)) as {
            aspects?: Record<string, unknown>;
        };
        if (record?.aspects?.["agent-skill"]) return "publication";
        if (record?.aspects?.[INSTALLATION_ASPECT]) return "installation";
        return "other";
    }
}

export class HttpAgentSkillStorage implements AgentSkillStorage {
    private readonly url: string;

    constructor(
        storageApiUrl: string,
        private readonly bucket: string,
        private readonly requestTimeoutMs: number = 30_000
    ) {
        this.url = baseUrl(storageApiUrl);
    }

    private objectUrl(archiveKey: string, recordId?: string): string {
        const url = `${this.url}/${encodeURIComponent(
            this.bucket
        )}/${encodeObjectKey(archiveKey)}`;
        return recordId
            ? `${url}?recordId=${encodeURIComponent(recordId)}`
            : url;
    }

    private async request(
        archiveKey: string,
        sessionToken: string,
        init: RequestInit,
        recordId?: string
    ): Promise<Response> {
        try {
            return await fetch(this.objectUrl(archiveKey, recordId), {
                ...init,
                headers: {
                    "X-Magda-Session": sessionToken,
                    ...(init.headers || {})
                },
                redirect: "error",
                signal: AbortSignal.timeout(this.requestTimeoutMs)
            });
        } catch {
            throw new DownstreamServiceError(
                "storage",
                503,
                "Storage API is unavailable"
            );
        }
    }

    async inspect(
        archiveKey: string,
        sessionToken: string
    ): Promise<StoredArchiveIdentity> {
        const response = await this.request(archiveKey, sessionToken, {
            method: "GET",
            headers: { Range: "bytes=0-0" }
        });
        if (response.status === 404) return { exists: false };
        if (response.status !== 206) {
            throw new DownstreamServiceError(
                "storage",
                response.status >= 400 ? response.status : 502,
                "Storage API returned an invalid range response"
            );
        }
        const contentRange = response.headers.get("content-range") || "";
        if (!/^bytes 0-0\/\d+$/.test(contentRange) || !response.body) {
            throw new DownstreamServiceError(
                "storage",
                502,
                "Storage API returned an invalid range response"
            );
        }
        const reader = response.body.getReader();
        const first = await reader.read();
        if (first.done || first.value.byteLength !== 1) {
            await reader.cancel();
            throw new DownstreamServiceError(
                "storage",
                502,
                "Storage API returned an invalid range response"
            );
        }
        const trailing = await reader.read();
        if (!trailing.done) {
            await reader.cancel();
            throw new DownstreamServiceError(
                "storage",
                502,
                "Storage API returned an oversized range response"
            );
        }
        const recordId =
            response.headers.get("x-amz-meta-magda-record-id") ||
            response.headers.get("magda-record-id");
        const ownerId =
            response.headers.get("x-amz-meta-magda-owner-id") ||
            response.headers.get("magda-owner-id");
        return {
            exists: true,
            ...(recordId ? { recordId } : {}),
            ...(ownerId ? { ownerId } : {})
        };
    }

    async download(
        archiveKey: string,
        sessionToken: string,
        maxBytes: number
    ): Promise<DownloadedArchive> {
        const response = await this.request(archiveKey, sessionToken, {
            method: "GET"
        });
        if (!response.ok) {
            throw new DownstreamServiceError(
                "storage",
                response.status,
                response.status === 404
                    ? "Published Agent Skill archive is missing"
                    : "Storage API rejected the archive read"
            );
        }
        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
            throw new DownstreamServiceError(
                "storage",
                409,
                "Published Agent Skill archive exceeds its size limit"
            );
        }
        if (!response.body) {
            throw new DownstreamServiceError(
                "storage",
                502,
                "Storage API returned an empty response"
            );
        }
        const reader = response.body.getReader();
        const chunks: Buffer[] = [];
        let size = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) {
                await reader.cancel();
                throw new DownstreamServiceError(
                    "storage",
                    409,
                    "Published Agent Skill archive exceeds its size limit"
                );
            }
            chunks.push(Buffer.from(value));
        }
        const recordId =
            response.headers.get("x-amz-meta-magda-record-id") ||
            response.headers.get("magda-record-id");
        const ownerId =
            response.headers.get("x-amz-meta-magda-owner-id") ||
            response.headers.get("magda-owner-id");
        return {
            bytes: Buffer.concat(chunks),
            contentType: response.headers.get("content-type") || "",
            ...(recordId ? { recordId } : {}),
            ...(ownerId ? { ownerId } : {})
        };
    }

    async upload(
        archiveKey: string,
        recordId: string,
        bytes: Buffer,
        sessionToken: string
    ): Promise<void> {
        const parts = archiveKey.split("/");
        const fileName = parts.pop();
        if (!fileName || !parts.length) {
            throw new DownstreamServiceError(
                "storage",
                500,
                "Agent Skill archive path is invalid"
            );
        }
        const uploadUrl = `${this.url}/upload/${encodeURIComponent(
            this.bucket
        )}/${encodeObjectKey(parts.join("/"))}?recordId=${encodeURIComponent(
            recordId
        )}`;
        const form = new FormData();
        form.append(
            "file",
            new Blob([bytes], { type: "application/zip" }),
            fileName
        );
        let response: Response;
        try {
            response = await fetch(uploadUrl, {
                method: "POST",
                headers: { "X-Magda-Session": sessionToken },
                body: form,
                redirect: "error",
                signal: AbortSignal.timeout(this.requestTimeoutMs)
            });
        } catch {
            throw new DownstreamServiceError(
                "storage",
                503,
                "Storage API is unavailable"
            );
        }
        if (!response.ok) {
            throw new DownstreamServiceError(
                "storage",
                response.status,
                "Storage API rejected the archive upload"
            );
        }
    }

    async delete(archiveKey: string, sessionToken: string): Promise<void> {
        const response = await this.request(archiveKey, sessionToken, {
            method: "DELETE"
        });
        if (!response.ok && response.status !== 404) {
            throw new DownstreamServiceError(
                "storage",
                response.status,
                "Storage API rejected the archive deletion"
            );
        }
    }
}

export class OpaAgentSkillAuthorization
    implements AgentSkillAuthorization, AgentSkillInstallationAuthorization {
    constructor(private readonly client: AuthDecisionQueryClient) {}

    async canInstallation(
        operation: "create" | "read" | "update" | "delete",
        record: AgentSkillInstallationRecord,
        sessionToken: string
    ): Promise<boolean> {
        const { aspects, ...recordFields } = record;
        try {
            const decision = await this.client.getAuthDecision(
                {
                    operationUri: `object/agentSkill/install/${operation}`,
                    unknowns: [],
                    input: {
                        object: {
                            agentSkillInstallation: {
                                ...recordFields,
                                ...aspects
                            }
                        }
                    }
                },
                sessionToken
            );
            return (
                decision.hasResidualRules === false &&
                isTrueEquivalent(decision.result)
            );
        } catch {
            throw new DownstreamServiceError(
                "authorization",
                503,
                "Authorization service is unavailable"
            );
        }
    }

    async can(
        operation: "create" | "read" | "update" | "delete",
        record: AgentSkillRecord,
        sessionToken: string
    ): Promise<boolean> {
        const { aspects, ...recordFields } = record;
        try {
            const decision = await this.client.getAuthDecision(
                {
                    operationUri: `object/agentSkill/${record.aspects["agent-skill"].type}/${operation}`,
                    unknowns: [],
                    input: {
                        object: {
                            agentSkill: {
                                ...recordFields,
                                ...aspects
                            }
                        }
                    }
                },
                sessionToken
            );
            return (
                decision.hasResidualRules === false &&
                isTrueEquivalent(decision.result)
            );
        } catch {
            throw new DownstreamServiceError(
                "authorization",
                503,
                "Authorization service is unavailable"
            );
        }
    }
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
}

/**
 * Authorization API Access Groups plus the Registry lookups needed to prove a
 * share group's binding. Every call uses the Agent Services internal session,
 * only after the real caller was authorized for the source publication.
 */
export class HttpAgentSkillShareGroups implements AgentSkillShareGroups {
    private readonly authUrl: string;
    private readonly registryUrl: string;

    constructor(
        authApiUrl: string,
        registryApiUrl: string,
        private readonly tenantId: number,
        private readonly requestTimeoutMs: number = 15_000
    ) {
        this.authUrl = baseUrl(authApiUrl);
        this.registryUrl = baseUrl(registryApiUrl);
    }

    private async request(
        service: "authorization" | "registry",
        url: string,
        sessionToken: string,
        init: RequestInit = {}
    ): Promise<Response> {
        try {
            return await fetch(url, {
                ...init,
                headers: {
                    "X-Magda-Session": sessionToken,
                    "X-Magda-Tenant-Id": String(this.tenantId),
                    ...(typeof init.body === "string"
                        ? { "Content-Type": "application/json" }
                        : {}),
                    ...(init.headers || {})
                },
                redirect: "error",
                signal: AbortSignal.timeout(this.requestTimeoutMs)
            });
        } catch {
            throw new DownstreamServiceError(
                service,
                503,
                service === "registry"
                    ? "Registry API is unavailable"
                    : "Authorization API is unavailable"
            );
        }
    }

    private async json(
        service: "authorization" | "registry",
        response: Response,
        message: string
    ): Promise<any> {
        if (!response.ok)
            throw new DownstreamServiceError(service, response.status, message);
        try {
            return await response.json();
        } catch {
            throw new DownstreamServiceError(
                service,
                502,
                `${message}: invalid response`
            );
        }
    }

    private group(value: any): AgentSkillShareGroup {
        const details = value?.aspects?.["access-group-details"] || value;
        if (!value || typeof value.id !== "string" || !details)
            throw new DownstreamServiceError(
                "authorization",
                502,
                "Access Group response is invalid"
            );
        return {
            id: value.id,
            resourceUri: String(details.resourceUri || ""),
            operationUris: stringArray(details.operationUris),
            permissionId: String(details.permissionId || ""),
            roleId: String(details.roleId || ""),
            keywords: stringArray(details.keywords)
        };
    }

    async find(
        keyword: string,
        sessionToken: string
    ): Promise<AgentSkillShareGroup[]> {
        const query = new URLSearchParams();
        query.append("aspect", "access-group-details");
        query.append(
            "aspectQuery",
            `access-group-details.keywords:<|${keyword}`
        );
        query.set("limit", "10");
        const data = await this.json(
            "registry",
            await this.request(
                "registry",
                `${this.registryUrl}/records?${query}`,
                sessionToken
            ),
            "Registry API rejected the share group query"
        );
        if (!Array.isArray(data?.records) || data.hasMore === true)
            throw new DownstreamServiceError(
                "registry",
                502,
                "Registry API returned an invalid share group response"
            );
        return data.records.map((record: unknown) => this.group(record));
    }

    async create(
        group: {
            name: string;
            description: string;
            resourceUri: string;
            operationUris: string[];
            keywords: string[];
        },
        sessionToken: string
    ): Promise<AgentSkillShareGroup> {
        const data = await this.json(
            "authorization",
            await this.request(
                "authorization",
                `${this.authUrl}/public/accessGroups`,
                sessionToken,
                {
                    method: "POST",
                    // A system-managed group: no owner or OrgUnit, so generic
                    // record grants never let anyone edit it directly.
                    body: JSON.stringify({
                        ...group,
                        ownerId: null,
                        orgUnitId: null
                    })
                }
            ),
            "Authorization API rejected share group creation"
        );
        return this.group(data);
    }

    async delete(groupId: string, sessionToken: string): Promise<void> {
        await this.json(
            "authorization",
            await this.request(
                "authorization",
                `${this.authUrl}/public/accessGroups/${encodeURIComponent(
                    groupId
                )}`,
                sessionToken,
                { method: "DELETE" }
            ),
            "Authorization API rejected share group deletion"
        );
    }

    private async membership(
        method: "POST" | "DELETE",
        groupId: string,
        userId: string,
        sessionToken: string
    ): Promise<boolean> {
        const response = await this.request(
            "authorization",
            `${this.authUrl}/public/accessGroups/${encodeURIComponent(
                groupId
            )}/users/${encodeURIComponent(userId)}`,
            sessionToken,
            { method }
        );
        if (response.status === 400 && method === "POST")
            // The Access Group API rejects unknown users with 400.
            throw new DownstreamServiceError(
                "authorization",
                404,
                "No MAGDA user has this ID"
            );
        const data = await this.json(
            "authorization",
            response,
            "Authorization API rejected the membership change"
        );
        return data?.result === true;
    }

    addUser(
        groupId: string,
        userId: string,
        sessionToken: string
    ): Promise<boolean> {
        return this.membership("POST", groupId, userId, sessionToken);
    }

    removeUser(
        groupId: string,
        userId: string,
        sessionToken: string
    ): Promise<boolean> {
        return this.membership("DELETE", groupId, userId, sessionToken);
    }

    async listUsers(
        groupId: string,
        options: { offset: number; limit: number },
        sessionToken: string
    ): Promise<AgentSkillShareRecipient[]> {
        const query = new URLSearchParams({
            offset: String(options.offset),
            limit: String(options.limit)
        });
        const data = await this.json(
            "authorization",
            await this.request(
                "authorization",
                `${this.authUrl}/public/accessGroups/${encodeURIComponent(
                    groupId
                )}/users?${query}`,
                sessionToken
            ),
            "Authorization API rejected the recipient query"
        );
        if (!Array.isArray(data))
            throw new DownstreamServiceError(
                "authorization",
                502,
                "Authorization API returned an invalid recipient response"
            );
        // Only the ID and display name leave Agent Services.
        return data
            .filter((user: any) => typeof user?.id === "string")
            .map((user: any) => ({
                id: user.id,
                ...(typeof user.displayName === "string"
                    ? { displayName: user.displayName }
                    : {})
            }));
    }

    async publicationsUsingPermission(
        permissionId: string,
        sessionToken: string
    ): Promise<string[]> {
        const query = new URLSearchParams();
        query.append("aspect", "agent-skill");
        query.append(
            "aspectQuery",
            `access-control.preAuthorisedPermissionIds:<|${permissionId}`
        );
        query.set("limit", "10");
        const data = await this.json(
            "registry",
            await this.request(
                "registry",
                `${this.registryUrl}/records?${query}`,
                sessionToken
            ),
            "Registry API rejected the share binding query"
        );
        if (!Array.isArray(data?.records))
            throw new DownstreamServiceError(
                "registry",
                502,
                "Registry API returned an invalid share binding response"
            );
        return data.records
            .map((record: any) => record?.id)
            .filter((id: unknown): id is string => typeof id === "string");
    }

    async orgUnitExists(
        orgUnitId: string,
        sessionToken: string
    ): Promise<boolean> {
        const response = await this.request(
            "authorization",
            `${this.authUrl}/public/orgunits/${encodeURIComponent(orgUnitId)}`,
            sessionToken
        );
        if (response.status === 404) return false;
        await this.json(
            "authorization",
            response,
            "Authorization API rejected the organisation unit lookup"
        );
        return true;
    }
}
