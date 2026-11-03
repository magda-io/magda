export const DEFAULT_AGENT_MODEL = "magda-agent-default";

export function resolveLlmModel(value: string | undefined): string {
    return value || DEFAULT_AGENT_MODEL;
}

export type AgentWorkspaceState =
    | "ABSENT"
    | "ALLOCATING"
    | "BOOTSTRAPPING"
    | "READY"
    | "SUSPENDING"
    | "SUSPENDED"
    | "RESUMING"
    | "DELETING"
    | "FAILED"
    | "DEGRADED";

export interface SkillSyncCounts {
    installed: number;
    updated: number;
    unchanged: number;
    removed: number;
    skipped: number;
    failed: number;
}

/** A sanitized per-skill problem: safe name and stable reason code only. */
export interface SkillSyncProblem {
    name: string;
    action: "failed" | "skipped";
    code: string;
}

export interface SkillSyncStatus {
    status: "success" | "partial" | "failed" | "notAttempted";
    attemptedAt?: string;
    completedAt?: string;
    counts?: SkillSyncCounts;
    diagnosticCode?:
        | "EXEC_FAILED"
        | "TIMEOUT"
        | "INVALID_RESULT"
        | "REMOTE_SOURCE_FAILED";
    problems?: SkillSyncProblem[];
    problemsTruncated?: boolean;
    // A Manager-owned attempt is running for this user's current claim.
    inProgress?: boolean;
}

export interface WorkspaceStatus {
    state: AgentWorkspaceState;
    message?: string;
    retryable?: boolean;
    updatedAt?: string;
    skillSync?: SkillSyncStatus;
}

export interface ManagerConfig {
    port: number;
    jwtSecret: string;
    namespace: string;
    installationId: string;
    warmPool: string;
    authApiUrl: string;
    registryApiUrl: string;
    storageApiUrl: string;
    defaultStorageBucket: string;
    tenantId: number;
    skillArchiveMaxCompressedBytes: number;
    skillArchiveMaxUncompressedBytes: number;
    skillArchiveMaxEntries: number;
    skillArchiveMaxPathLength: number;
    skillArchiveMaxNestingDepth: number;
    skillArchiveMaxMarkdownBytes: number;
    systemUserId: string;
    managedApiKeyName: string;
    externalUrl: string;
    externalAuthority: string;
    runtimePrefix: string;
    sandboxPort: number;
    agentContainer: string;
    launchTokenFile: string;
    bootstrapCommand: string;
    magdaApiUrl: string;
    llmApiUrl: string;
    llmModel: string;
    llmReasoningEffort?: string;
    llmContextWindow: number;
    llmMaxTokens: number;
    hardDeleteSeconds: number;
    idleSuspendSeconds: number;
    reconcileIntervalSeconds: number;
    runtimeMaxBodyBytes: number;
    // How often open DSH WebSockets re-check `agentWorkspace/access`.
    runtimeAuthRecheckSeconds?: number;
    // How long a Retry request waits for its sync before answering 202.
    skillSyncRetryWaitMs?: number;
    controlPlaneSecret: string;
}

export interface SandboxClaim {
    apiVersion: string;
    kind: string;
    metadata: {
        name: string;
        uid?: string;
        creationTimestamp?: string;
        deletionTimestamp?: string;
        labels?: Record<string, string>;
        annotations?: Record<string, string>;
        resourceVersion?: string;
    };
    spec?: {
        warmPoolRef?: { name?: string };
        lifecycle?: {
            shutdownPolicy?: string;
            shutdownTime?: string;
        };
    };
    status?: {
        sandbox?: {
            name?: string;
            serviceFQDN?: string;
        };
        conditions?: Array<{
            type: string;
            status: string;
            reason?: string;
            message?: string;
            lastTransitionTime?: string;
        }>;
    };
}

export interface Sandbox {
    metadata?: { name?: string };
    spec?: { operatingMode?: "Running" | "Suspended" };
    status?: {
        serviceFQDN?: string;
        conditions?: Array<{
            type: string;
            status: string;
            reason?: string;
            message?: string;
        }>;
    };
}

export interface AuthenticatedUser {
    id: string;
    sessionToken: string;
}
