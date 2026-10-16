export type AgentSkillType = "system" | "user";
export type AgentSkillState = "PENDING" | "READY" | "DELETING";

export interface AgentSkillAspect {
    name: string;
    type: AgentSkillType;
    /** Intended Workspace user for user publications; absent for system publications. */
    userId?: string;
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
    orgUnitId?: string;
    preAuthorisedPermissionIds?: string[];
    constraintExemption?: boolean;
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
    type: AgentSkillType;
    userId?: string;
    ownerId: string;
    createdAt: string;
    createdBy: string;
    updatedAt: string;
    updatedBy: string;
    checksum: string;
}

export type WorkspaceSkillSourceKind =
    | "system-publication"
    | "own-user-publication"
    | "installation";

export interface WorkspaceSkillManifestItem {
    selectionId: string;
    effectiveName: string;
    sourceKind: WorkspaceSkillSourceKind;
    source: AgentSkillMetadata;
}

export interface WorkspaceSkillManifestWarning {
    sourceKind: Exclude<WorkspaceSkillSourceKind, "installation">;
    code: "INVALID_RECORD" | "READ_DENIED" | "DUPLICATE_RECORD";
    recordId?: string;
}

export interface WorkspaceSkillManifest {
    version: 1;
    complete: true;
    items: WorkspaceSkillManifestItem[];
    warnings: WorkspaceSkillManifestWarning[];
    sources: {
        system: { complete: true; count: number };
        user: { complete: true; count: number };
        installations: { status: "notImplemented"; count: 0 };
    };
}

/** Caller-scoped manifest for reconciling user publications to local storage. */
export interface LocalSkillSyncManifest {
    version: 1;
    complete: true;
    identity: {
        tenantId: string;
        userId: string;
    };
    items: WorkspaceSkillManifestItem[];
    warnings: WorkspaceSkillManifestWarning[];
    sources: {
        user: { complete: true; count: number };
        installations: { status: "notImplemented"; count: 0 };
    };
}

export interface RegistryRecordsPage {
    totalCount?: number;
    hasMore: boolean;
    nextPageToken?: string;
    records: unknown[];
}

export interface RegistryListOptions {
    type?: AgentSkillType;
    state?: AgentSkillState;
    userId?: {
        operator: "eq" | "neq";
        value: string;
    };
    anyOf?: Array<{
        field: "type" | "userId";
        operator: "eq" | "neq";
        value: string;
    }>;
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
    recordId?: string;
    ownerId?: string;
}

export interface StoredArchiveIdentity {
    exists: boolean;
    recordId?: string;
    ownerId?: string;
}

export interface AgentSkillStorage {
    inspect(
        archiveKey: string,
        sessionToken: string
    ): Promise<StoredArchiveIdentity>;
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
