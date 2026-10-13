import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import { isTrueEquivalent } from "magda-typescript-common/src/opa/AuthDecision.js";
import {
    AgentSkillAuthorization,
    AgentSkillRecord,
    AgentSkillRegistry,
    AgentSkillStorage,
    DownloadedArchive,
    RegistryListOptions,
    RegistryRecordsPage
} from "./types.js";

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

export class HttpAgentSkillRegistry implements AgentSkillRegistry {
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
        if (options.scope) {
            query.append("aspectQuery", `agent-skill.scope:${options.scope}`);
        }
        if (options.state) {
            query.append("aspectQuery", `agent-skill.state:${options.state}`);
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
        if (!data || !Array.isArray(data.records)) {
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
            hasMore: data.hasMore === true,
            nextPageToken:
                typeof data.nextPageToken === "string"
                    ? data.nextPageToken
                    : undefined,
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

    async exists(archiveKey: string, sessionToken: string): Promise<boolean> {
        const response = await this.request(archiveKey, sessionToken, {
            method: "GET",
            headers: { Range: "bytes=0-0" }
        });
        if (response.status === 404) return false;
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
        return true;
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
        return {
            bytes: Buffer.concat(chunks),
            contentType: response.headers.get("content-type") || ""
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

export class OpaAgentSkillAuthorization implements AgentSkillAuthorization {
    constructor(private readonly client: AuthDecisionQueryClient) {}

    async can(
        operation: "create" | "read" | "update" | "delete",
        record: AgentSkillRecord,
        sessionToken: string
    ): Promise<boolean> {
        const { aspects, ...recordFields } = record;
        try {
            const decision = await this.client.getAuthDecision(
                {
                    operationUri: `object/agentSkill/${operation}`,
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
