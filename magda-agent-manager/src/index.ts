import http from "node:http";
import { URL } from "node:url";
import buildApp from "./buildApp.js";
import { ManagedApiKeyClient } from "./apiKeys.js";
import { AgentKubernetesClient } from "./kubernetes.js";
import { AgentManager } from "./manager.js";
import { RuntimeProxy } from "./runtimeProxy.js";
import { ManagerConfig } from "./types.js";

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
}

const externalUrl = process.env.EXTERNAL_URL || "http://localhost:6100";
const externalAuthority = new URL(externalUrl).host;
const config: ManagerConfig = {
    port: Number(process.env.PORT || 80),
    jwtSecret: required("JWT_SECRET"),
    namespace: process.env.SANDBOX_NAMESPACE || "magda-agent",
    warmPool: process.env.SANDBOX_WARM_POOL || "magda-agent-runc",
    authApiUrl: process.env.AUTH_API_URL || "http://authorization-api/v0",
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
    llmProvider: process.env.MAGDA_LLM_PROVIDER || "magda",
    llmModel: process.env.MAGDA_LLM_MODEL || "magda-agent-default",
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
const proxy = new RuntimeProxy(config, kubernetes);
const manager = new AgentManager(config, kubernetes, apiKeys, proxy);
const app = buildApp(config, manager);
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
const reconcileTimer = setInterval(
    () =>
        manager
            .reconcileIdleWorkspaces()
            .catch((error) =>
                console.error("Agent Workspace reconciliation failed", error)
            ),
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
