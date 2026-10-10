import * as k8s from "@kubernetes/client-node";
import { ApiException } from "@kubernetes/client-node";
import { PromiseMiddlewareWrapper } from "@kubernetes/client-node/dist/gen/middleware.js";
import { PassThrough, Writable } from "node:stream";
import {
    ManagerConfig,
    Sandbox,
    SandboxClaim,
    WorkspaceStatus
} from "./types.js";

const EXT_GROUP = "extensions.agents.x-k8s.io";
const SANDBOX_GROUP = "agents.x-k8s.io";
const VERSION = "v1beta1";
const CLAIMS = "sandboxclaims";
const SANDBOXES = "sandboxes";

export const USER_LABEL = "agent.magda.io/user-id";
export const STATE_ANNOTATION = "agent.magda.io/bootstrap-state";
export const ERROR_ANNOTATION = "agent.magda.io/bootstrap-error";
export const UPDATED_ANNOTATION = "agent.magda.io/updated-at";
export const KEY_ID_ANNOTATION = "agent.magda.io/api-key-id";
export const LAST_ACTIVITY_ANNOTATION = "agent.magda.io/last-activity";

const mergePatchOptions = {
    middleware: [
        new PromiseMiddlewareWrapper(
            k8s.setHeaderMiddleware(
                "Content-Type",
                k8s.PatchStrategy.MergePatch
            )[0]
        )
    ]
};

function isNotFound(error: unknown) {
    return error instanceof ApiException && error.code === 404;
}

function readyCondition(resource: {
    status?: {
        conditions?: Array<{
            type: string;
            status: string;
            reason?: string;
            message?: string;
        }>;
    };
}) {
    return resource.status?.conditions?.find(
        (condition) => condition.type === "Ready"
    );
}

export function claimName(userId: string) {
    return `magda-agent-${userId.toLowerCase()}`;
}

export class AgentKubernetesClient {
    readonly config: k8s.KubeConfig;
    readonly customApi: k8s.CustomObjectsApi;
    readonly coreApi: k8s.CoreV1Api;
    readonly execClient: k8s.Exec;
    readonly watchClient: k8s.Watch;

    constructor(private readonly options: ManagerConfig) {
        this.config = new k8s.KubeConfig();
        this.config.loadFromDefault();
        this.customApi = this.config.makeApiClient(k8s.CustomObjectsApi);
        this.coreApi = this.config.makeApiClient(k8s.CoreV1Api);
        this.execClient = new k8s.Exec(this.config);
        this.watchClient = new k8s.Watch(this.config);
    }

    async listClaims(): Promise<SandboxClaim[]> {
        const response = (await this.customApi.listNamespacedCustomObject({
            group: EXT_GROUP,
            version: VERSION,
            namespace: this.options.namespace,
            plural: CLAIMS,
            labelSelector: USER_LABEL
        })) as { items?: SandboxClaim[] };
        return response.items || [];
    }

    async getClaim(userId: string): Promise<SandboxClaim | undefined> {
        try {
            return (await this.customApi.getNamespacedCustomObject({
                group: EXT_GROUP,
                version: VERSION,
                namespace: this.options.namespace,
                plural: CLAIMS,
                name: claimName(userId)
            })) as SandboxClaim;
        } catch (error) {
            if (isNotFound(error)) return undefined;
            throw error;
        }
    }

    async createClaim(userId: string): Promise<SandboxClaim> {
        const now = new Date();
        const shutdownTime = new Date(
            now.getTime() + this.options.hardDeleteSeconds * 1000
        ).toISOString();
        const body: SandboxClaim = {
            apiVersion: `${EXT_GROUP}/${VERSION}`,
            kind: "SandboxClaim",
            metadata: {
                name: claimName(userId),
                labels: { [USER_LABEL]: userId },
                annotations: {
                    [STATE_ANNOTATION]: "ALLOCATING",
                    [UPDATED_ANNOTATION]: now.toISOString(),
                    [LAST_ACTIVITY_ANNOTATION]: now.toISOString()
                }
            },
            spec: {
                warmPoolRef: { name: this.options.warmPool },
                lifecycle: {
                    shutdownPolicy: "DeleteForeground",
                    shutdownTime
                }
            }
        };
        try {
            return (await this.customApi.createNamespacedCustomObject({
                group: EXT_GROUP,
                version: VERSION,
                namespace: this.options.namespace,
                plural: CLAIMS,
                body
            })) as SandboxClaim;
        } catch (error) {
            if (error instanceof ApiException && error.code === 409) {
                const existing = await this.getClaim(userId);
                if (existing) return existing;
            }
            throw error;
        }
    }

    async patchClaimAnnotations(
        userId: string,
        annotations: Record<string, string | null>
    ) {
        return (await this.customApi.patchNamespacedCustomObject(
            {
                group: EXT_GROUP,
                version: VERSION,
                namespace: this.options.namespace,
                plural: CLAIMS,
                name: claimName(userId),
                body: {
                    metadata: {
                        annotations: {
                            ...annotations,
                            [UPDATED_ANNOTATION]: new Date().toISOString()
                        }
                    }
                }
            },
            mergePatchOptions
        )) as SandboxClaim;
    }

    async deleteClaim(userId: string): Promise<void> {
        try {
            await this.customApi.deleteNamespacedCustomObject({
                group: EXT_GROUP,
                version: VERSION,
                namespace: this.options.namespace,
                plural: CLAIMS,
                name: claimName(userId),
                propagationPolicy: "Foreground",
                body: { propagationPolicy: "Foreground" }
            });
        } catch (error) {
            if (!isNotFound(error)) throw error;
        }
    }

    async waitForClaimReady(
        userId: string,
        timeoutMs = 300_000
    ): Promise<SandboxClaim> {
        const current = await this.getClaim(userId);
        if (current && readyCondition(current)?.status === "True")
            return current;

        const name = claimName(userId);
        return new Promise<SandboxClaim>(async (resolve, reject) => {
            let settled = false;
            let controller: AbortController | undefined;
            const finish = (error?: unknown, claim?: SandboxClaim) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                controller?.abort();
                if (error) reject(error);
                else resolve(claim as SandboxClaim);
            };
            const timer = setTimeout(
                () =>
                    finish(
                        new Error(
                            "Timed out waiting for Agent Sandbox allocation"
                        )
                    ),
                timeoutMs
            );
            try {
                controller = await this.watchClient.watch(
                    `/apis/${EXT_GROUP}/${VERSION}/namespaces/${this.options.namespace}/${CLAIMS}`,
                    {
                        fieldSelector: `metadata.name=${name}`,
                        resourceVersion: current?.metadata.resourceVersion
                    },
                    (phase, object: SandboxClaim) => {
                        if (phase === "DELETED") {
                            finish(
                                new Error(
                                    "Agent Workspace was deleted while allocating"
                                )
                            );
                            return;
                        }
                        const ready = readyCondition(object);
                        if (
                            ready?.status === "True" &&
                            object.status?.sandbox?.name
                        ) {
                            finish(undefined, object);
                        } else if (
                            ready?.status === "False" &&
                            ready.reason &&
                            /fail|error|invalid/i.test(ready.reason)
                        ) {
                            finish(
                                new Error(
                                    ready.message ||
                                        `Sandbox allocation failed: ${ready.reason}`
                                )
                            );
                        }
                    },
                    (error) => {
                        if (error && !settled) finish(error);
                    }
                );
            } catch (error) {
                finish(error);
            }
        });
    }

    async getSandbox(name: string): Promise<Sandbox | undefined> {
        try {
            return (await this.customApi.getNamespacedCustomObject({
                group: SANDBOX_GROUP,
                version: VERSION,
                namespace: this.options.namespace,
                plural: SANDBOXES,
                name
            })) as Sandbox;
        } catch (error) {
            if (isNotFound(error)) return undefined;
            throw error;
        }
    }

    async setSandboxOperatingMode(
        name: string,
        operatingMode: "Running" | "Suspended"
    ) {
        await this.customApi.patchNamespacedCustomObject(
            {
                group: SANDBOX_GROUP,
                version: VERSION,
                namespace: this.options.namespace,
                plural: SANDBOXES,
                name,
                body: { spec: { operatingMode } }
            },
            mergePatchOptions
        );
    }

    private async readPod(name: string) {
        return this.coreApi.readNamespacedPod({
            namespace: this.options.namespace,
            name
        });
    }

    async containerRestartCount(podName: string): Promise<number> {
        const pod = await this.readPod(podName);
        return (
            pod.status?.containerStatuses?.find(
                (status) => status.name === this.options.agentContainer
            )?.restartCount || 0
        );
    }

    async waitForPodReady(
        podName: string,
        timeoutMs = 300_000,
        minimumRestartCount?: number
    ) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const pod = await this.readPod(podName);
                const restartCount =
                    pod.status?.containerStatuses?.find(
                        (status) => status.name === this.options.agentContainer
                    )?.restartCount || 0;
                if (
                    (minimumRestartCount === undefined ||
                        restartCount >= minimumRestartCount) &&
                    pod.status?.conditions?.some(
                        (condition) =>
                            condition.type === "Ready" &&
                            condition.status === "True"
                    )
                ) {
                    return;
                }
            } catch (error) {
                if (!isNotFound(error)) throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        throw new Error(
            "Timed out waiting for Agent Sandbox runtime readiness"
        );
    }

    private async exec(
        podName: string,
        command: string[],
        input?: string,
        timeoutMs = 90_000
    ): Promise<string> {
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        const stdout = new Writable({
            write(chunk, _encoding, callback) {
                stdoutChunks.push(Buffer.from(chunk));
                callback();
            }
        });
        const stderr = new Writable({
            write(chunk, _encoding, callback) {
                stderrChunks.push(Buffer.from(chunk));
                callback();
            }
        });
        const stdin = new PassThrough();

        return new Promise<string>(async (resolve, reject) => {
            let settled = false;
            const finish = (error?: unknown) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (error) reject(error);
                else resolve(Buffer.concat(stdoutChunks).toString("utf8"));
            };
            const timer = setTimeout(
                () =>
                    finish(
                        new Error(`Kubernetes exec timed out for ${podName}`)
                    ),
                timeoutMs
            );
            try {
                await this.execClient.exec(
                    this.options.namespace,
                    podName,
                    this.options.agentContainer,
                    command,
                    stdout,
                    stderr,
                    input === undefined ? null : stdin,
                    false,
                    (status) => {
                        if (status.status === "Success") finish();
                        else {
                            finish(
                                new Error(
                                    status.message ||
                                        Buffer.concat(stderrChunks).toString(
                                            "utf8"
                                        ) ||
                                        "Kubernetes exec failed"
                                )
                            );
                        }
                    }
                );
                if (input !== undefined) stdin.end(input);
            } catch (error) {
                finish(error);
            }
        });
    }

    async bootstrap(podName: string, payload: object) {
        await this.exec(
            podName,
            [this.options.bootstrapCommand],
            `${JSON.stringify(payload)}\n`
        );
    }

    async readLaunchToken(podName: string): Promise<string> {
        const token = (
            await this.exec(podName, ["cat", this.options.launchTokenFile])
        ).trim();
        if (!/^[A-Za-z0-9_-]+$/.test(token)) {
            throw new Error("Agent runtime launch token is not ready");
        }
        return token;
    }

    async status(userId: string): Promise<WorkspaceStatus> {
        const claim = await this.getClaim(userId);
        if (!claim) return { state: "ABSENT" };
        const annotations = claim.metadata.annotations || {};
        const updatedAt =
            annotations[UPDATED_ANNOTATION] || claim.metadata.creationTimestamp;
        if (claim.metadata.deletionTimestamp) {
            return { state: "DELETING", updatedAt };
        }
        const bootstrapState = annotations[STATE_ANNOTATION];
        if (bootstrapState === "FAILED") {
            return {
                state: "FAILED",
                message:
                    annotations[ERROR_ANNOTATION] ||
                    "Agent Workspace provisioning failed",
                retryable: true,
                updatedAt
            };
        }
        const sandboxName = claim.status?.sandbox?.name;
        const sandbox = sandboxName
            ? await this.getSandbox(sandboxName)
            : undefined;
        // Suspension makes the claim's Ready condition false while preserving
        // its bound Sandbox. Project that durable mode before treating an
        // unbound/not-ready claim as allocation in progress.
        if (sandbox?.spec?.operatingMode === "Suspended") {
            return { state: "SUSPENDED", updatedAt };
        }
        if (bootstrapState === "SUSPENDING") {
            return { state: "SUSPENDING", updatedAt };
        }
        if (bootstrapState === "RESUMING") {
            return { state: "RESUMING", updatedAt };
        }
        const ready = readyCondition(claim);
        if (!sandboxName || ready?.status !== "True") {
            const failed =
                ready?.status === "False" &&
                ready.reason &&
                /fail|error|invalid/i.test(ready.reason);
            return {
                state: failed ? "FAILED" : "ALLOCATING",
                message: failed ? ready.message || ready.reason : undefined,
                retryable: failed ? true : undefined,
                updatedAt
            };
        }
        if (bootstrapState === "READY") {
            return { state: "READY", updatedAt };
        }
        return { state: "BOOTSTRAPPING", updatedAt };
    }
}
