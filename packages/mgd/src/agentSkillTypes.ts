export type AgentSkillType = "system" | "user";
export type AgentSkillListType = AgentSkillType | "all";

export interface AgentSkillRef {
    type: AgentSkillType;
    id: string;
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

export interface AgentSkillPage {
    items: AgentSkillMetadata[];
    hasMore: boolean;
    nextPageToken?: string;
}

/** The recipient installation that selected a shared source (#3861). */
export interface WorkspaceSkillManifestInstallation {
    id: string;
    userId: string;
    sourceSkillId: string;
    alias?: string;
}

export interface WorkspaceSkillManifestItem {
    /** Publication ID, or the recipient installation ID. */
    selectionId: string;
    effectiveName: string;
    sourceKind: "system-publication" | "own-user-publication" | "installation";
    /** Always the original publication. */
    source: AgentSkillMetadata;
    installation?: WorkspaceSkillManifestInstallation;
}

/**
 * An installation whose source is authoritatively unavailable to the caller
 * (revoked, deleted or invalid). Its managed copies may be removed; the
 * recipient can uninstall the record.
 */
export interface UnavailableSkillInstallation {
    installationId: string;
    effectiveName: string;
    sourceSkillId: string;
    code: "SOURCE_UNAVAILABLE";
}

export interface WorkspaceSkillManifest {
    version: 1;
    complete: true;
    items: WorkspaceSkillManifestItem[];
    warnings: Array<{
        sourceKind: string;
        code: string;
        recordId?: string;
    }>;
    unavailableInstallations: UnavailableSkillInstallation[];
}

export interface WorkspaceSkillManifestWithIdentity
    extends WorkspaceSkillManifest {
    identity: { tenantId: string; userId: string };
}

export interface LocalSkillManifest {
    version: 1;
    complete: true;
    identity: { tenantId: string; userId: string };
    items: WorkspaceSkillManifestItem[];
    warnings: WorkspaceSkillManifest["warnings"];
    unavailableInstallations: UnavailableSkillInstallation[];
}

/** How a recipient currently sees an installation's original source. */
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

export interface AgentSkillInstallationPage {
    items: Array<
        AgentSkillInstallation | { id: string; problem: "INVALID_RECORD" }
    >;
    hasMore: boolean;
    nextPageToken?: string;
}

export interface AgentSkillAccess {
    id: string;
    type: AgentSkillType;
    public?: boolean;
    orgUnitId?: string;
    recipients: { count: number };
}

export interface AgentSkillSyncCounts {
    installed: number;
    updated: number;
    unchanged: number;
    removed: number;
    skipped: number;
    failed: number;
}

export interface AgentSkillSyncItemResult {
    ref: AgentSkillRef;
    name: string;
    action:
        | "installed"
        | "updated"
        | "unchanged"
        | "removed"
        | "skipped"
        | "failed";
    code?: string;
    /** Installation target, when the item concerns one harness copy. */
    harness?: string;
    path?: string;
}

export interface AgentSkillSyncConflict {
    name: string;
    harness: string;
    path: string;
    reason: string;
    detail?: string;
    /** Source account recorded by the installation, when known. */
    source?: {
        key: string;
        baseUrl?: string;
        userId?: string;
        profiles?: string[];
    };
    remedy: string;
}

export interface AgentSkillSyncResult {
    status: "success" | "partial" | "failed" | "notAttempted";
    counts: AgentSkillSyncCounts;
    items: AgentSkillSyncItemResult[];
    manifestWarnings: number;
    /** Unresolved conflicts, unsafe paths and failures, with remedies. */
    conflicts?: AgentSkillSyncConflict[];
    /**
     * The remote manifest or a required publication could not be verified;
     * no installed skill was changed.
     */
    remoteSourceFailed?: true;
}

export function parseAgentSkillRef(value: string): AgentSkillRef {
    const match = /^(system|user)\/([^/]+)$/.exec(value);
    if (!match) {
        throw new Error("Agent Skill reference must be <system|user>/<id>");
    }
    return { type: match[1] as AgentSkillType, id: match[2] };
}
