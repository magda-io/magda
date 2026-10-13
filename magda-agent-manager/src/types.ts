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

export interface WorkspaceStatus {
    state: AgentWorkspaceState;
    message?: string;
    retryable?: boolean;
    updatedAt?: string;
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
