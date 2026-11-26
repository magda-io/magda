import type { V1Container } from "@kubernetes/client-node";

/**
 * Read the Workspace model config (`MAGDA_LLM_MODEL_CONFIG`): the JSON that
 * the Helm helper `agent-services.workspaceModelJson` validated and rendered. It's passed
 * on unchanged, re-serialised, to the Sandbox Pods, whose DSH overlay reads
 * it; only its shape is checked here.
 */
export function parseModelConfig(value: string | undefined): string {
    if (!value) throw new Error("MAGDA_LLM_MODEL_CONFIG is required");
    let config: unknown;
    try {
        config = JSON.parse(value);
    } catch {
        throw new Error("MAGDA_LLM_MODEL_CONFIG must be JSON");
    }
    if (
        typeof config !== "object" ||
        config === null ||
        Array.isArray(config) ||
        typeof (config as { alias?: unknown }).alias !== "string" ||
        !(config as { alias: string }).alias.trim()
    ) {
        throw new Error(
            "MAGDA_LLM_MODEL_CONFIG must be an object with a non-empty alias"
        );
    }
    return JSON.stringify(config);
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
    // The Workspace model config JSON (MAGDA_LLM_MODEL_CONFIG), written into
    // a claimed Sandbox's Pod template each time it resumes.
    llmModelConfig: string;
    hardDeleteSeconds: number;
    idleSuspendSeconds: number;
    reconcileIntervalSeconds: number;
    runtimeMaxBodyBytes: number;
    // Largest DSH attachment upload, streamed rather than buffered.
    runtimeMaxUploadBytes?: number;
    // How long and how much of a rejected request body to read and discard
    // after answering it early (default 5 seconds and 16 MiB).
    runtimeLingerLimits?: { lingerSeconds: number; maxDiscardBytes: number };
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
    metadata?: { name?: string; resourceVersion?: string };
    spec?: {
        operatingMode?: "Running" | "Suspended";
        podTemplate?: { spec?: { containers?: V1Container[] } };
    };
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
