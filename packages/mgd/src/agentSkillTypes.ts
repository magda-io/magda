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

export interface WorkspaceSkillManifestItem {
    selectionId: string;
    effectiveName: string;
    sourceKind: "system-publication" | "own-user-publication" | "installation";
    source: AgentSkillMetadata;
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
    sources?: {
        user: { complete: true; count: number };
        installations: { status: "notImplemented"; count: 0 };
    };
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
}

export function parseAgentSkillRef(value: string): AgentSkillRef {
    const match = /^(system|user)\/([^/]+)$/.exec(value);
    if (!match) {
        throw new Error("Agent Skill reference must be <system|user>/<id>");
    }
    return { type: match[1] as AgentSkillType, id: match[2] };
}
