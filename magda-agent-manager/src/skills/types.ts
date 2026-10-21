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

/** The recipient installation that selected a shared source (#3861). */
export interface WorkspaceSkillManifestInstallation {
    id: string;
    userId: string;
    sourceSkillId: string;
    alias?: string;
}

export interface WorkspaceSkillManifestItem {
    /** Publication ID, or the recipient installation ID for an installation. */
    selectionId: string;
    effectiveName: string;
    sourceKind: WorkspaceSkillSourceKind;
    /** Always the original publication, never a copy. */
    source: AgentSkillMetadata;
    installation?: WorkspaceSkillManifestInstallation;
}

/**
 * Manifest warnings make desired membership uncertain, so clients abort
 * reconciliation before changing any installed skill.
 */
export interface WorkspaceSkillManifestWarning {
    sourceKind: WorkspaceSkillSourceKind;
    code:
        | "INVALID_RECORD"
        | "READ_DENIED"
        | "DUPLICATE_RECORD"
        | "SOURCE_PENDING";
    recordId?: string;
}

/**
 * An installation whose source is authoritatively no longer eligible for the
 * caller: the source was deleted, its read grant was revoked, or it is not a
 * valid shared publication. Revoked and deleted are deliberately not
 * distinguished. Unlike a warning, this is a definitive answer: clients may
 * remove clean managed copies, and the recipient can still uninstall.
 */
export interface UnavailableSkillInstallation {
    installationId: string;
    effectiveName: string;
    sourceSkillId: string;
    code: "SOURCE_UNAVAILABLE";
}

export interface WorkspaceSkillInstallationSource {
    complete: true;
    /** Eligible installations included in items. */
    count: number;
    unavailable: number;
}

export interface WorkspaceSkillManifest {
    version: 1;
    complete: true;
    /** Authenticated caller; the CLI derives its account-isolated cache key. */
    identity: {
        tenantId: string;
        userId: string;
    };
    items: WorkspaceSkillManifestItem[];
    warnings: WorkspaceSkillManifestWarning[];
    unavailableInstallations: UnavailableSkillInstallation[];
    sources: {
        system: { complete: true; count: number };
        user: { complete: true; count: number };
        installations: WorkspaceSkillInstallationSource;
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
    unavailableInstallations: UnavailableSkillInstallation[];
    sources: {
        user: { complete: true; count: number };
        installations: WorkspaceSkillInstallationSource;
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

/* ------------------------------ #3861 sharing ----------------------------- */

export interface AgentSkillInstallationAspect {
    userId: string;
    sourceSkillId: string;
    alias?: string;
    createdAt: string;
}

/** A recipient-owned installation record: no publication aspect, no ZIP. */
export interface AgentSkillInstallationRecord {
    id: string;
    name: string;
    tenantId?: number;
    aspects: {
        "agent-skill-installation": AgentSkillInstallationAspect;
        "access-control": { ownerId: string };
    };
}

export interface AgentSkillInstallationMetadata {
    id: string;
    effectiveName: string;
    alias?: string;
    userId: string;
    sourceSkillId: string;
    createdAt: string;
}

/**
 * The source as the caller may currently see it. Publisher metadata is only
 * returned while the caller can read the source.
 */
export type AgentSkillInstallationSourceState =
    | { status: "available"; skill: AgentSkillMetadata }
    | { status: "pending" }
    | { status: "unavailable" };

export interface AgentSkillInstallationView
    extends AgentSkillInstallationMetadata {
    source: AgentSkillInstallationSourceState;
}

/** What currently occupies a deterministic record ID. */
export type AgentSkillRecordOccupant =
    | "none"
    | "publication"
    | "installation"
    | "other";

export interface AgentSkillInstallationRegistry {
    getInstallation(
        id: string,
        sessionToken: string
    ): Promise<unknown | undefined>;
    listInstallations(
        options: { userId: string; pageToken?: string; limit: number },
        sessionToken: string
    ): Promise<RegistryRecordsPage>;
    createInstallation(
        record: AgentSkillInstallationRecord,
        sessionToken: string
    ): Promise<unknown>;
    deleteInstallation(id: string, sessionToken: string): Promise<void>;
    occupant(
        id: string,
        sessionToken: string
    ): Promise<AgentSkillRecordOccupant>;
}

export interface AgentSkillInstallationAuthorization {
    canInstallation(
        operation: "create" | "read" | "update" | "delete",
        record: AgentSkillInstallationRecord,
        sessionToken: string
    ): Promise<boolean>;
}

/** The parts of an Access Group record that bind it to one publication. */
export interface AgentSkillShareGroup {
    id: string;
    resourceUri: string;
    operationUris: string[];
    permissionId: string;
    roleId: string;
    keywords: string[];
}

export interface AgentSkillShareRecipient {
    id: string;
    displayName?: string;
}

/**
 * Authorization API Access Group operations used for source-scoped sharing,
 * always with the Agent Services internal session after the real caller was
 * authorized for the source.
 */
export interface AgentSkillShareGroups {
    find(
        keyword: string,
        sessionToken: string
    ): Promise<AgentSkillShareGroup[]>;
    create(
        group: {
            name: string;
            description: string;
            resourceUri: string;
            operationUris: string[];
            keywords: string[];
        },
        sessionToken: string
    ): Promise<AgentSkillShareGroup>;
    delete(groupId: string, sessionToken: string): Promise<void>;
    addUser(
        groupId: string,
        userId: string,
        sessionToken: string
    ): Promise<boolean>;
    removeUser(
        groupId: string,
        userId: string,
        sessionToken: string
    ): Promise<boolean>;
    listUsers(
        groupId: string,
        options: { offset: number; limit: number },
        sessionToken: string
    ): Promise<AgentSkillShareRecipient[]>;
    /**
     * IDs of Agent Skill publications whose access-control lists the
     * permission. `complete` is false when Registry reported more matches than
     * were returned.
     */
    publicationsUsingPermission(
        permissionId: string,
        sessionToken: string
    ): Promise<{ ids: string[]; complete: boolean }>;
    orgUnitExists(orgUnitId: string, sessionToken: string): Promise<boolean>;
}
