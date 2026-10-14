export type AgentSkillScope = "system" | "user";
export type AgentSkillState = "PENDING" | "READY" | "DELETING";

export interface AgentSkillAspect {
    name: string;
    scope: AgentSkillScope;
    createdAt: string;
    createdBy: string;
    description: string;
    archiveKey: string;
    updatedAt: string;
    updatedBy: string;
    checksum: string;
    state: AgentSkillState;
}

export interface AgentSkillAccessControl {
    ownerId: string;
    preAuthorisedPermissionIds?: string[];
}

export interface AgentSkillRecord {
    id: string;
    name: string;
    tenantId?: number;
    aspects: {
        "agent-skill": AgentSkillAspect;
        "access-control": AgentSkillAccessControl;
        [aspectId: string]: unknown;
    };
}

export interface AgentSkillMetadata {
    id: string;
    name: string;
    description: string;
    scope: AgentSkillScope;
    ownerId: string;
    createdAt: string;
    createdBy: string;
    updatedAt: string;
    updatedBy: string;
    checksum: string;
}

export interface RegistryRecordsPage {
    totalCount?: number;
    hasMore: boolean;
    nextPageToken?: string;
    records: unknown[];
}

export interface RegistryListOptions {
    scope?: AgentSkillScope;
    state?: AgentSkillState;
    pageToken?: string;
    limit: number;
    q?: string;
}

export interface AgentSkillRegistry {
    get(id: string, sessionToken: string): Promise<unknown | undefined>;
    list(
        options: RegistryListOptions,
        sessionToken: string
    ): Promise<RegistryRecordsPage>;
    create(record: AgentSkillRecord, sessionToken: string): Promise<unknown>;
    put(record: AgentSkillRecord, sessionToken: string): Promise<unknown>;
    delete(id: string, sessionToken: string): Promise<void>;
}

export interface DownloadedArchive {
    bytes: Buffer;
    contentType: string;
}

export interface AgentSkillStorage {
    exists(archiveKey: string, sessionToken: string): Promise<boolean>;
    download(
        archiveKey: string,
        sessionToken: string,
        maxBytes: number
    ): Promise<DownloadedArchive>;
    upload(
        archiveKey: string,
        recordId: string,
        bytes: Buffer,
        sessionToken: string
    ): Promise<void>;
    delete(archiveKey: string, sessionToken: string): Promise<void>;
}

export interface AgentSkillAuthorization {
    can(
        operation: "create" | "read" | "update" | "delete",
        record: AgentSkillRecord,
        sessionToken: string
    ): Promise<boolean>;
}

export interface ValidatedAgentSkillArchive {
    name: string;
    description: string;
    checksum: string;
}

export interface AgentSkillArchiveLimits {
    maxCompressedBytes: number;
    maxUncompressedBytes: number;
    maxEntries: number;
    maxPathLength: number;
    maxNestingDepth: number;
    maxSkillMarkdownBytes: number;
}
