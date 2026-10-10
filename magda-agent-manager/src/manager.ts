import { ManagedApiKeyClient } from "./apiKeys.js";
import {
    AgentKubernetesClient,
    ERROR_ANNOTATION,
    KEY_ID_ANNOTATION,
    LAST_ACTIVITY_ANNOTATION,
    STATE_ANNOTATION,
    USER_LABEL
} from "./kubernetes.js";
import { RuntimeProxy } from "./runtimeProxy.js";
import { ManagerConfig, WorkspaceStatus } from "./types.js";

export class AgentManager {
    private readonly operations = new Map<
        string,
        { promise: Promise<void>; state: WorkspaceStatus["state"] }
    >();

    constructor(
        private readonly config: ManagerConfig,
        private readonly kubernetes: AgentKubernetesClient,
        private readonly apiKeys: ManagedApiKeyClient,
        private readonly proxy: RuntimeProxy
    ) {}

    async status(userId: string): Promise<WorkspaceStatus> {
        const status = await this.kubernetes.status(userId);
        const operation = this.operations.get(userId);
        if (
            operation &&
            (status.state === "ABSENT" || operation.state === "DELETING")
        ) {
            return {
                state: operation.state,
                updatedAt: new Date().toISOString()
            };
        }
        return status;
    }

    private runOnce(
        userId: string,
        state: WorkspaceStatus["state"],
        operation: () => Promise<void>
    ) {
        const running = this.operations.get(userId);
        if (running) return running.promise;
        let promise: Promise<void>;
        promise = operation()
            .catch((error) => {
                console.error(
                    `Agent Workspace operation failed for ${userId}`,
                    error
                );
            })
            .finally(() => {
                if (this.operations.get(userId)?.promise === promise) {
                    this.operations.delete(userId);
                }
            });
        this.operations.set(userId, { promise, state });
        return promise;
    }

    private queueOperation(
        userId: string,
        state: WorkspaceStatus["state"],
        operation: () => Promise<void>
    ) {
        const prior = this.operations.get(userId)?.promise || Promise.resolve();
        let promise: Promise<void>;
        promise = prior
            .then(operation)
            .catch((error) => {
                console.error(
                    `Agent Workspace queued operation failed for ${userId}`,
                    error
                );
            })
            .finally(() => {
                if (this.operations.get(userId)?.promise === promise) {
                    this.operations.delete(userId);
                }
            });
        this.operations.set(userId, { promise, state });
        return promise;
    }

    private bootstrapPayload(userId: string, key: { id: string; key: string }) {
        return {
            version: 1,
            userId,
            magda: {
                baseUrl: this.config.magdaApiUrl,
                apiKeyId: key.id,
                apiKey: key.key,
                profile: "magda-agent-workspace"
            },
            llm: {
                baseUrl: this.config.llmApiUrl,
                provider: this.config.llmProvider,
                model: this.config.llmModel,
                reasoningEffort: this.config.llmReasoningEffort,
                // pi-ai adds the HTTP Authorization scheme. Supplying `Bearer `
                // here makes the value fail its raw API-key validation.
                authorization: `${key.id}:${key.key}`
            }
        };
    }

    private async provision(userId: string) {
        let key: { id: string; key: string } | undefined;
        try {
            // Persist a recoverable claim before issuing the raw credential. If
            // the Manager exits after rotation, startup reconciliation can find
            // this installation-scoped claim and destroy both resources.
            await this.kubernetes.createClaim(userId);
            key = await this.apiKeys.rotate(
                userId,
                new Date(Date.now() + this.config.hardDeleteSeconds * 1000)
            );
            const claim = await this.kubernetes.waitForClaimReady(userId);
            const sandbox = claim.status?.sandbox?.name;
            if (!sandbox) {
                throw new Error("Allocated Agent Workspace has no runtime");
            }
            await this.kubernetes.patchClaimAnnotations(userId, {
                [STATE_ANNOTATION]: "BOOTSTRAPPING",
                [ERROR_ANNOTATION]: null,
                [KEY_ID_ANNOTATION]: key.id
            });
            await this.kubernetes.waitForPodReady(sandbox);
            const restartCount = await this.kubernetes.containerRestartCount(
                sandbox
            );
            await this.kubernetes.bootstrap(
                sandbox,
                this.bootstrapPayload(userId, key)
            );
            // Bootstrap persists the managed provider config and exits the
            // warm container so DSH consumes it without putting credentials in
            // claim metadata or environment. Wait for that exact restart, not
            // a stale Ready condition from the pre-bootstrap process.
            await this.kubernetes.waitForPodReady(
                sandbox,
                300_000,
                restartCount + 1
            );
            await this.kubernetes.patchClaimAnnotations(userId, {
                [STATE_ANNOTATION]: "READY",
                [ERROR_ANNOTATION]: null,
                [KEY_ID_ANNOTATION]: key.id
            });
        } catch (error) {
            const claim = await this.kubernetes
                .getClaim(userId)
                .catch(() => undefined);
            if (claim) {
                // A partially bootstrapped PVC may already contain the raw key.
                // Keep DELETING on cleanup failure so reconciliation retries
                // revocation before removing the claim and owner-controlled PVC.
                await this.destroy(userId, true).catch((cleanupError) =>
                    console.error(
                        "Could not clean up failed Agent Workspace provisioning",
                        cleanupError
                    )
                );
            } else if (key) {
                // Defensive fallback for an unexpected claim disappearance.
                await this.apiKeys.delete(userId, key.id);
            }
            throw error;
        }
    }

    async start(userId: string): Promise<WorkspaceStatus> {
        const status = await this.status(userId);
        if (status.state === "ABSENT") {
            this.runOnce(userId, "ALLOCATING", () => this.provision(userId));
            return { state: "ALLOCATING", updatedAt: new Date().toISOString() };
        }
        if (status.state === "SUSPENDED") return this.resume(userId);
        if (status.state === "FAILED" || status.state === "DEGRADED") {
            return status;
        }
        return status;
    }

    private async waitForClaimDeletion(userId: string, timeoutMs = 180_000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (!(await this.kubernetes.getClaim(userId))) return;
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        throw new Error("Timed out deleting the previous Agent Workspace");
    }

    private async destroy(userId: string, retryOnFailure = false) {
        await this.proxy.closeUserSockets(userId);
        await this.kubernetes
            .patchClaimAnnotations(userId, {
                [STATE_ANNOTATION]: "DELETING"
            })
            .catch(() => undefined);
        try {
            // Revoke authority first. If Kubernetes deletion fails, the
            // workspace remains visible and retryable but no stale credential
            // survives a partially completed destroy.
            await this.apiKeys.delete(userId);
            await this.kubernetes.deleteClaim(userId);
            await this.waitForClaimDeletion(userId);
        } catch (error) {
            if (await this.kubernetes.getClaim(userId).catch(() => undefined)) {
                await this.kubernetes
                    .patchClaimAnnotations(userId, {
                        [STATE_ANNOTATION]: retryOnFailure
                            ? "DELETING"
                            : "FAILED",
                        [ERROR_ANNOTATION]:
                            error instanceof Error
                                ? error.message.slice(0, 1000)
                                : "Could not delete Agent Workspace"
                    })
                    .catch(console.error);
            }
            throw error;
        }
    }

    async delete(userId: string, wait = false): Promise<WorkspaceStatus> {
        const current = await this.status(userId);
        if (current.state === "ABSENT") return current;
        const operation = this.queueOperation(userId, "DELETING", () =>
            this.destroy(userId)
        );
        if (!wait) {
            return { state: "DELETING", updatedAt: new Date().toISOString() };
        }
        await operation;
        const completed = await this.status(userId);
        if (completed.state !== "ABSENT") {
            throw new Error("Agent Workspace cleanup did not complete");
        }
        return completed;
    }

    async reset(userId: string): Promise<WorkspaceStatus> {
        this.queueOperation(userId, "DELETING", async () => {
            if ((await this.kubernetes.status(userId)).state !== "ABSENT") {
                await this.destroy(userId);
            }
            const running = this.operations.get(userId);
            if (running) running.state = "ALLOCATING";
            await this.provision(userId);
        });
        return { state: "DELETING", updatedAt: new Date().toISOString() };
    }

    async recordMeaningfulActivity(userId: string, activityTime = new Date()) {
        const claim = await this.kubernetes.getClaim(userId);
        if (!claim) return;
        const keyId = claim.metadata.annotations?.[KEY_ID_ANNOTATION];
        const expiryTime = new Date(
            activityTime.getTime() + this.config.hardDeleteSeconds * 1000
        );
        await Promise.all([
            this.kubernetes.updateActivity(userId, activityTime),
            ...(keyId ? [this.apiKeys.extend(userId, keyId, expiryTime)] : [])
        ]);
    }

    private async recoverTransientClaim(
        userId: string,
        state: WorkspaceStatus["state"],
        sandbox: string | undefined
    ): Promise<boolean> {
        if (state === "DELETING") {
            await this.destroy(userId, true);
            return true;
        }
        if (state === "ALLOCATING" || state === "BOOTSTRAPPING") {
            // The raw managed key exists only in the in-memory bootstrap payload.
            // Destroy the partial workspace; if revocation fails, destroy keeps
            // DELETING so the next reconciliation retries without losing key
            // identity or leaving a credential-bearing PVC reachable.
            await this.destroy(userId, true);
            return true;
        }
        if (state !== "SUSPENDING" && state !== "RESUMING") return false;
        if (!sandbox) {
            await this.kubernetes.patchClaimAnnotations(userId, {
                [STATE_ANNOTATION]: "FAILED",
                [ERROR_ANNOTATION]:
                    "Agent Manager restarted during a lifecycle transition and the runtime is missing"
            });
            return true;
        }
        try {
            if (state === "SUSPENDING") {
                await this.kubernetes.setSandboxOperatingMode(
                    sandbox,
                    "Suspended"
                );
                await this.kubernetes.patchClaimAnnotations(userId, {
                    [STATE_ANNOTATION]: "SUSPENDED",
                    [ERROR_ANNOTATION]: null
                });
            } else {
                await this.kubernetes.setSandboxOperatingMode(
                    sandbox,
                    "Running"
                );
                await this.kubernetes.waitForPodReady(sandbox);
                await this.kubernetes.patchClaimAnnotations(userId, {
                    [STATE_ANNOTATION]: "READY",
                    [ERROR_ANNOTATION]: null
                });
                await this.recordMeaningfulActivity(userId);
            }
        } catch (error) {
            await this.kubernetes.patchClaimAnnotations(userId, {
                [STATE_ANNOTATION]: "FAILED",
                [ERROR_ANNOTATION]:
                    error instanceof Error
                        ? error.message.slice(0, 1000)
                        : "Could not recover Agent Workspace transition"
            });
            throw error;
        }
        return true;
    }

    async reconcileIdleWorkspaces() {
        const now = Date.now();
        const suspendCutoff = now - this.config.idleSuspendSeconds * 1000;
        const deleteCutoff = now - this.config.hardDeleteSeconds * 1000;
        const claims = await this.kubernetes.listClaims();
        await Promise.allSettled(
            claims.map(async (claim) => {
                const userId = claim.metadata.labels?.[USER_LABEL];
                const sandbox = claim.status?.sandbox?.name;
                const state = claim.metadata.annotations?.[STATE_ANNOTATION];
                const lastActivity = Date.parse(
                    claim.metadata.annotations?.[LAST_ACTIVITY_ANNOTATION] ||
                        claim.metadata.creationTimestamp ||
                        ""
                );
                if (!userId || this.operations.has(userId)) return;
                if (
                    state &&
                    (await this.recoverTransientClaim(
                        userId,
                        state as WorkspaceStatus["state"],
                        sandbox
                    ))
                ) {
                    return;
                }
                if (!Number.isFinite(lastActivity)) return;
                if (lastActivity <= deleteCutoff) {
                    await this.delete(userId, true);
                    return;
                }
                if (
                    !sandbox ||
                    state !== "READY" ||
                    lastActivity > suspendCutoff
                ) {
                    return;
                }
                await this.kubernetes.patchClaimAnnotations(userId, {
                    [STATE_ANNOTATION]: "SUSPENDING",
                    [ERROR_ANNOTATION]: null
                });
                try {
                    await this.kubernetes.setSandboxOperatingMode(
                        sandbox,
                        "Suspended"
                    );
                    await this.kubernetes.patchClaimAnnotations(userId, {
                        [STATE_ANNOTATION]: "SUSPENDED",
                        [ERROR_ANNOTATION]: null
                    });
                } catch (error) {
                    await this.kubernetes.patchClaimAnnotations(userId, {
                        [STATE_ANNOTATION]: "FAILED",
                        [ERROR_ANNOTATION]:
                            error instanceof Error
                                ? error.message.slice(0, 1000)
                                : "Could not suspend idle Agent Workspace"
                    });
                    throw error;
                }
            })
        );
    }

    async resume(userId: string): Promise<WorkspaceStatus> {
        const current = await this.status(userId);
        if (current.state === "READY") return current;
        if (current.state !== "SUSPENDED") return current;
        this.runOnce(userId, "RESUMING", async () => {
            const claim = await this.kubernetes.getClaim(userId);
            const sandbox = claim?.status?.sandbox?.name;
            if (!sandbox) throw new Error("Agent Workspace runtime is missing");
            await this.kubernetes.patchClaimAnnotations(userId, {
                [STATE_ANNOTATION]: "RESUMING",
                [ERROR_ANNOTATION]: null
            });
            try {
                await this.kubernetes.setSandboxOperatingMode(
                    sandbox,
                    "Running"
                );
                await this.kubernetes.waitForPodReady(sandbox);
                await this.kubernetes.patchClaimAnnotations(userId, {
                    [STATE_ANNOTATION]: "READY",
                    [ERROR_ANNOTATION]: null
                });
                await this.recordMeaningfulActivity(userId);
            } catch (error) {
                await this.kubernetes.patchClaimAnnotations(userId, {
                    [STATE_ANNOTATION]: "FAILED",
                    [ERROR_ANNOTATION]:
                        error instanceof Error
                            ? error.message.slice(0, 1000)
                            : "Could not resume Agent Workspace"
                });
                throw error;
            }
        });
        return { state: "RESUMING", updatedAt: new Date().toISOString() };
    }
}
