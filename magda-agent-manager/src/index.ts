import http from "node:http";
import { URL } from "node:url";
import buildApp from "./buildApp.js";
import { ManagedApiKeyClient } from "./apiKeys.js";
import { AgentKubernetesClient } from "./kubernetes.js";
import { AgentManager } from "./manager.js";
import { RuntimeProxy } from "./runtimeProxy.js";
import { ManagerConfig, resolveLlmModel } from "./types.js";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import {
    HttpAgentSkillRegistry,
    HttpAgentSkillStorage,
    OpaAgentSkillAuthorization
} from "./skills/clients.js";
import { AgentSkillService } from "./skills/service.js";

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
}

function positiveInteger(name: string, fallback: number): number {
    const value = Number(process.env[name] || fallback);
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }
    return value;
}

function nonNegativeInteger(name: string, fallback: number): number {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${name} must be a non-negative integer`);
    }
    return value;
}

const externalUrl = process.env.EXTERNAL_URL || "http://localhost:6100";
const externalAuthority = new URL(externalUrl).host;
const config: ManagerConfig = {
    port: Number(process.env.PORT || 80),
    jwtSecret: required("JWT_SECRET"),
    namespace: process.env.SANDBOX_NAMESPACE || "magda-agent",
    installationId: required("MAGDA_INSTALLATION_ID"),
    warmPool: process.env.SANDBOX_WARM_POOL || "magda-agent-runc",
    authApiUrl: process.env.AUTH_API_URL || "http://authorization-api/v0",
    registryApiUrl: process.env.REGISTRY_API_URL || "http://registry-api/v0",
    storageApiUrl: process.env.STORAGE_API_URL || "http://storage-api/v0",
    defaultStorageBucket:
        process.env.DEFAULT_STORAGE_BUCKET || "magda-datasets",
    tenantId: nonNegativeInteger("TENANT_ID", 0),
    skillArchiveMaxCompressedBytes: positiveInteger(
        "SKILL_ARCHIVE_MAX_COMPRESSED_BYTES",
        8 * 1024 * 1024
    ),
    skillArchiveMaxUncompressedBytes: positiveInteger(
        "SKILL_ARCHIVE_MAX_UNCOMPRESSED_BYTES",
        32 * 1024 * 1024
    ),
    skillArchiveMaxEntries: positiveInteger("SKILL_ARCHIVE_MAX_ENTRIES", 256),
    skillArchiveMaxPathLength: positiveInteger(
        "SKILL_ARCHIVE_MAX_PATH_LENGTH",
        240
    ),
    skillArchiveMaxNestingDepth: positiveInteger(
        "SKILL_ARCHIVE_MAX_NESTING_DEPTH",
        8
    ),
    skillArchiveMaxMarkdownBytes: positiveInteger(
        "SKILL_ARCHIVE_MAX_MARKDOWN_BYTES",
        1024 * 1024
    ),
    systemUserId: required("SYSTEM_USER_ID"),
    managedApiKeyName:
        process.env.MANAGED_API_KEY_NAME || "magda-agent-workspace",
    externalUrl,
    externalAuthority,
    runtimePrefix: process.env.RUNTIME_PREFIX || "/v0/runtime",
    sandboxPort: Number(process.env.SANDBOX_PORT || 3080),
    agentContainer: process.env.AGENT_CONTAINER || "agent",
    launchTokenFile:
        process.env.DSH_LAUNCH_TOKEN_FILE ||
        "/run/magda-agent/dsh-launch-token",
    bootstrapCommand:
        process.env.BOOTSTRAP_COMMAND || "/usr/local/bin/magda-agent-bootstrap",
    magdaApiUrl:
        process.env.MAGDA_API_URL || `${externalUrl.replace(/\/$/, "")}/api`,
    llmApiUrl:
        process.env.MAGDA_LLM_API_URL ||
        `${externalUrl.replace(/\/$/, "")}/api/v0/llm/v1`,
    llmModel: resolveLlmModel(process.env.MAGDA_LLM_MODEL),
    llmReasoningEffort: process.env.MAGDA_LLM_REASONING_EFFORT || undefined,
    llmContextWindow: positiveInteger("MAGDA_LLM_CONTEXT_WINDOW", 1_050_000),
    llmMaxTokens: positiveInteger("MAGDA_LLM_MAX_TOKENS", 128_000),
    hardDeleteSeconds: Number(process.env.HARD_DELETE_SECONDS || 8 * 60 * 60),
    idleSuspendSeconds: Number(process.env.IDLE_SUSPEND_SECONDS || 30 * 60),
    reconcileIntervalSeconds: Number(
        process.env.RECONCILE_INTERVAL_SECONDS || 30
    ),
    runtimeMaxBodyBytes: Number(
        process.env.RUNTIME_MAX_BODY_BYTES || 16 * 1024 * 1024
    ),
    controlPlaneSecret: process.env.CONTROL_PLANE_SECRET || ""
};
if (config.llmMaxTokens > config.llmContextWindow) {
    throw new Error(
        "MAGDA_LLM_MAX_TOKENS must not exceed MAGDA_LLM_CONTEXT_WINDOW"
    );
}
if (
    config.skillArchiveMaxMarkdownBytes >
    config.skillArchiveMaxUncompressedBytes
) {
    throw new Error(
        "SKILL_ARCHIVE_MAX_MARKDOWN_BYTES must not exceed SKILL_ARCHIVE_MAX_UNCOMPRESSED_BYTES"
    );
}
if (!config.controlPlaneSecret) {
    throw new Error("CONTROL_PLANE_SECRET is required");
}

const kubernetes = new AgentKubernetesClient(config);
const apiKeys = new ManagedApiKeyClient({
    authApiUrl: config.authApiUrl,
    jwtSecret: config.jwtSecret,
    systemUserId: config.systemUserId,
    name: config.managedApiKeyName
});
let manager: AgentManager;
const proxy = new RuntimeProxy(config, kubernetes, (userId, activityTime) =>
    manager.recordMeaningfulActivity(userId, activityTime)
);
manager = new AgentManager(config, kubernetes, apiKeys, proxy);
const skillService = new AgentSkillService({
    registry: new HttpAgentSkillRegistry(
        config.registryApiUrl,
        config.tenantId
    ),
    storage: new HttpAgentSkillStorage(
        config.storageApiUrl,
        config.defaultStorageBucket
    ),
    authorization: new OpaAgentSkillAuthorization(
        new AuthDecisionQueryClient(config.authApiUrl)
    ),
    tenantId: config.tenantId,
    jwtSecret: config.jwtSecret,
    archiveLimits: {
        maxCompressedBytes: config.skillArchiveMaxCompressedBytes,
        maxUncompressedBytes: config.skillArchiveMaxUncompressedBytes,
        maxEntries: config.skillArchiveMaxEntries,
        maxPathLength: config.skillArchiveMaxPathLength,
        maxNestingDepth: config.skillArchiveMaxNestingDepth,
        maxSkillMarkdownBytes: config.skillArchiveMaxMarkdownBytes
    }
});
const app = buildApp(config, manager, skillService);
const server = http.createServer((req, res) => {
    if (
        req.url === config.runtimePrefix ||
        req.url?.startsWith(`${config.runtimePrefix}/`) ||
        req.url?.startsWith(`${config.runtimePrefix}?`)
    ) {
        proxy.handleHttp(req, res);
        return;
    }
    app(req, res);
});
server.requestTimeout = 0;
server.on("upgrade", (req, socket, head) => {
    if (
        req.url === config.runtimePrefix ||
        req.url?.startsWith(`${config.runtimePrefix}/`) ||
        req.url?.startsWith(`${config.runtimePrefix}?`)
    ) {
        proxy.handleUpgrade(req, socket, head);
        return;
    }
    socket.destroy();
});
let reconciliation: Promise<void> | undefined;
const reconcile = () => {
    if (reconciliation) return reconciliation;
    reconciliation = manager
        .reconcileIdleWorkspaces()
        .catch((error) =>
            console.error("Agent Workspace reconciliation failed", error)
        )
        .finally(() => {
            reconciliation = undefined;
        });
    return reconciliation;
};
void reconcile();
const reconcileTimer = setInterval(
    reconcile,
    config.reconcileIntervalSeconds * 1000
);
reconcileTimer.unref();

server.listen(config.port, () =>
    console.log(
        JSON.stringify({
            event: "agent-manager-listening",
            port: config.port,
            namespace: config.namespace,
            warmPool: config.warmPool
        })
    )
);

process.on("SIGTERM", () => {
    clearInterval(reconcileTimer);
    proxy.closeAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
});
