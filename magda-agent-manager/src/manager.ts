import { ManagedApiKeyClient } from "./apiKeys.js";
import {
    AgentKubernetesClient,
    ERROR_ANNOTATION,
    KEY_ID_ANNOTATION,
    LAST_ACTIVITY_ANNOTATION,
    RESET_AFTER_DELETE_ANNOTATION,
    SKILL_SYNC_ATTEMPTED_ANNOTATION,
    SKILL_SYNC_COMPLETED_ANNOTATION,
    SKILL_SYNC_COUNTS_ANNOTATION,
    SKILL_SYNC_DIAGNOSTIC_ANNOTATION,
    SKILL_SYNC_PROBLEMS_ANNOTATION,
    SKILL_SYNC_STATUS_ANNOTATION,
    STATE_ANNOTATION,
    USER_LABEL,
    skillSyncStatus
} from "./kubernetes.js";
import { RuntimeProxy } from "./runtimeProxy.js";
import { parseSkillSyncSummary } from "./skillSyncSummary.js";
import { ManagerConfig, SkillSyncStatus, WorkspaceStatus } from "./types.js";

/** A user-facing Workspace request that cannot proceed in the current state. */
export class WorkspaceRequestError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly code: string
    ) {
        super(message);
    }
}

export interface SkillSyncRetryResult {
    // The attempt finished within the request; otherwise poll GET /session.
    completed: boolean;
    // A forced Manager attempt for this claim was already running.
    deduplicated: boolean;
    skillSync: SkillSyncStatus;
}

export class AgentManager {
    private readonly operations = new Map<
        string,
        { promise: Promise<void>; state: WorkspaceStatus["state"] }
    >();
    private readonly activityRenewals = new Map<string, Promise<void>>();
    private readonly pendingDeletes = new Map<string, number>();
    // Manager-owned skill sync attempts by claim UID. Agent Manager runs as a
    // single replica, so this serializes all Manager attempts for a claim.
    private readonly skillSyncs = new Map<
        string,
        { userId: string; force: boolean; promise: Promise<void> }
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
        // Read-only: a status request never starts or re-checks a sync.
        if (
            status.skillSync &&
            [...this.skillSyncs.values()].some(
                (attempt) => attempt.userId === userId
            )
        ) {
            return {
                ...status,
                skillSync: { ...status.skillSync, inProgress: true }
            };
        }
        return status;
    }

    private runOnce(
        userId: string,
        state: WorkspaceStatus["state"],
        operation: (
            setState: (state: WorkspaceStatus["state"]) => void
        ) => Promise<void>
    ) {
        const running = this.operations.get(userId);
        if (running) return running.promise;
        let promise: Promise<void>;
        const setState = (nextState: WorkspaceStatus["state"]) => {
            const current = this.operations.get(userId);
            if (current?.promise === promise) current.state = nextState;
        };
        promise = Promise.resolve()
            .then(() => operation(setState))
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
        operation: (
            setState: (state: WorkspaceStatus["state"]) => void
        ) => Promise<void>
    ) {
        const prior = this.operations.get(userId)?.promise || Promise.resolve();
        let promise: Promise<void>;
        const setState = (nextState: WorkspaceStatus["state"]) => {
            const current = this.operations.get(userId);
            if (current?.promise === promise) current.state = nextState;
        };
        promise = prior
            .then(() => operation(setState))
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

    private addPendingDelete(userId: string) {
        this.pendingDeletes.set(
            userId,
            (this.pendingDeletes.get(userId) || 0) + 1
        );
    }

    private removePendingDelete(userId: string) {
        const remaining = (this.pendingDeletes.get(userId) || 1) - 1;
        if (remaining > 0) this.pendingDeletes.set(userId, remaining);
        else this.pendingDeletes.delete(userId);
    }

    /**
     * Detached, best-effort Workspace skill sync; never gates READY/DSH.
     * `force` is true for the provisioning call that itself created the claim
     * and bootstrapped its new Sandbox, where no user-authored skill can exist
     * yet, and for a user-confirmed Retry / Re-check. Reconnect, restart
     * recovery and reattachment use ordinary, non-forced reconciliation so
     * existing edits survive.
     *
     * Attempts for one claim never overlap. A request is satisfied by a
     * running attempt unless it needs `force` and the running one is not
     * forced; then the forced attempt runs after the current one finishes.
     */
    private scheduleSkillSync(
        userId: string,
        claimUid: string,
        sandbox: string,
        force: boolean
    ): Promise<void> {
        const running = this.skillSyncs.get(claimUid);
        if (running && (running.force || !force)) return running.promise;
        const attempt = {
            userId,
            force,
            promise: Promise.resolve()
        };
        attempt.promise = (async () => {
            await running?.promise.catch(() => undefined);
            await this.runSkillSync(userId, claimUid, sandbox, force);
        })().finally(() => {
            if (this.skillSyncs.get(claimUid) === attempt) {
                this.skillSyncs.delete(claimUid);
            }
        });
        this.skillSyncs.set(claimUid, attempt);
        return attempt.promise;
    }

    /**
     * One Manager-owned attempt. Every status write is guarded by the claim UID
     * and READY state, so a reset, deletion or replacement during the attempt
     * leaves the newer claim untouched. Never throws.
     */
    private async runSkillSync(
        userId: string,
        claimUid: string,
        sandbox: string,
        force: boolean
    ): Promise<void> {
        const attemptedAt = new Date().toISOString();
        try {
            await this.kubernetes.patchSkillSyncAnnotations(userId, claimUid, {
                [SKILL_SYNC_STATUS_ANNOTATION]: "notAttempted",
                [SKILL_SYNC_ATTEMPTED_ANNOTATION]: attemptedAt,
                [SKILL_SYNC_DIAGNOSTIC_ANNOTATION]: "",
                [SKILL_SYNC_PROBLEMS_ANNOTATION]: ""
            });
            const result = parseSkillSyncSummary(
                await this.kubernetes.syncSkills(sandbox, { force })
            );
            await this.kubernetes.patchSkillSyncAnnotations(userId, claimUid, {
                [SKILL_SYNC_STATUS_ANNOTATION]: result.status,
                [SKILL_SYNC_COMPLETED_ANNOTATION]: new Date().toISOString(),
                [SKILL_SYNC_COUNTS_ANNOTATION]: JSON.stringify(result.counts),
                [SKILL_SYNC_DIAGNOSTIC_ANNOTATION]: result.remoteSourceFailed
                    ? "REMOTE_SOURCE_FAILED"
                    : "",
                [SKILL_SYNC_PROBLEMS_ANNOTATION]:
                    result.problems.length || result.problemsTruncated
                        ? JSON.stringify({
                              items: result.problems,
                              truncated: result.problemsTruncated
                          })
                        : ""
            });
        } catch (error) {
            const diagnostic =
                error instanceof Error && /timed out/i.test(error.message)
                    ? "TIMEOUT"
                    : error instanceof SyntaxError ||
                      (error instanceof Error &&
                          /Invalid Agent Skill sync result/.test(error.message))
                    ? "INVALID_RESULT"
                    : "EXEC_FAILED";
            await this.kubernetes
                .patchSkillSyncAnnotations(userId, claimUid, {
                    [SKILL_SYNC_STATUS_ANNOTATION]: "failed",
                    [SKILL_SYNC_COMPLETED_ANNOTATION]: new Date().toISOString(),
                    [SKILL_SYNC_COUNTS_ANNOTATION]: JSON.stringify({
                        installed: 0,
                        updated: 0,
                        unchanged: 0,
                        removed: 0,
                        skipped: 0,
                        failed: 1
                    }),
                    [SKILL_SYNC_DIAGNOSTIC_ANNOTATION]: diagnostic,
                    [SKILL_SYNC_PROBLEMS_ANNOTATION]: ""
                })
                .catch(() => undefined);
        }
    }

    /**
     * User-confirmed Retry / Re-check skill sync (#3857). Runs a forced sync
     * in the caller's own current READY Sandbox. The target comes only from
     * the authenticated user ID; the result is what the Sandbox reported and
     * the Manager validated, never a client-supplied outcome.
     */
    async retrySkillSync(userId: string): Promise<SkillSyncRetryResult> {
        if (this.operations.has(userId)) {
            throw new WorkspaceRequestError(
                "Another Agent Workspace operation is in progress",
                409,
                "WORKSPACE_BUSY"
            );
        }
        const claim = await this.kubernetes.getClaim(userId);
        const claimUid = claim?.metadata.uid;
        const sandbox = claim?.status?.sandbox?.name;
        if (
            !claim ||
            !claimUid ||
            !sandbox ||
            claim.metadata.deletionTimestamp ||
            claim.metadata.labels?.[USER_LABEL] !== userId ||
            claim.metadata.annotations?.[STATE_ANNOTATION] !== "READY"
        ) {
            throw new WorkspaceRequestError(
                "Agent Workspace must be ready before skills can be re-checked",
                409,
                "WORKSPACE_NOT_READY"
            );
        }
        const deduplicated = !!this.skillSyncs.get(claimUid)?.force;
        const attempt = this.scheduleSkillSync(userId, claimUid, sandbox, true);
        let timer: NodeJS.Timeout | undefined;
        const completed = await Promise.race([
            attempt.then(() => true),
            new Promise<boolean>((resolve) => {
                timer = setTimeout(
                    () => resolve(false),
                    this.config.skillSyncRetryWaitMs ?? 25_000
                );
            })
        ]).finally(() => clearTimeout(timer));
        // A reset, deletion or replacement during the attempt means its result
        // (if any) was not recorded for the caller's current Workspace.
        const current = await this.kubernetes.getClaim(userId);
        if (
            !current ||
            current.metadata.uid !== claimUid ||
            current.metadata.deletionTimestamp ||
            current.metadata.annotations?.[STATE_ANNOTATION] !== "READY" ||
            this.operations.has(userId)
        ) {
            throw new WorkspaceRequestError(
                "Agent Workspace changed while skills were being re-checked",
                409,
                "WORKSPACE_CHANGED"
            );
        }
        return {
            completed,
            deduplicated,
            skillSync: {
                ...skillSyncStatus(current.metadata.annotations || {}),
                ...(this.skillSyncs.has(claimUid) ? { inProgress: true } : {})
            }
        };
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
                model: this.config.llmModel,
                ...(this.config.llmReasoningEffort
                    ? { reasoningEffort: this.config.llmReasoningEffort }
                    : {}),
                contextWindow: this.config.llmContextWindow,
                maxTokens: this.config.llmMaxTokens,
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
            const { created: freshClaim } = await this.kubernetes.createClaim(
                userId
            );
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
            const readyClaim = await this.kubernetes.patchClaimAnnotations(
                userId,
                {
                    [STATE_ANNOTATION]: "READY",
                    [ERROR_ANNOTATION]: null,
                    [KEY_ID_ANNOTATION]: key.id,
                    [SKILL_SYNC_STATUS_ANNOTATION]: "notAttempted",
                    [SKILL_SYNC_DIAGNOSTIC_ANNOTATION]: null,
                    [SKILL_SYNC_COUNTS_ANNOTATION]: null,
                    [SKILL_SYNC_ATTEMPTED_ANNOTATION]: null,
                    [SKILL_SYNC_COMPLETED_ANNOTATION]: null
                }
            );
            if (readyClaim.metadata.uid) {
                this.scheduleSkillSync(
                    userId,
                    readyClaim.metadata.uid,
                    sandbox,
                    freshClaim
                );
            }
        } catch (error) {
            const claim = await this.kubernetes
                .getClaim(userId)
                .catch(() => undefined);
            if (claim) {
                // A partially bootstrapped PVC may already contain the raw key.
                // Keep DELETING on cleanup failure so reconciliation retries
                // revocation before removing the claim and owner-controlled PVC.
                await this.destroy(userId).catch((cleanupError) =>
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

    private async destroy(userId: string) {
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
                        // Any partial destructive operation must remain
                        // retryable. FAILED is reserved for non-destructive
                        // lifecycle failures; reconciliation owns DELETING.
                        [STATE_ANNOTATION]: "DELETING",
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
        // Record Terminate before the first await so an in-flight Reset recovery
        // cannot provision after its cleanup completes.
        this.addPendingDelete(userId);
        let releaseAfterOperation = false;
        try {
            const current = await this.status(userId);
            if (current.state === "ABSENT") return current;
            // Persist the override immediately as well, so a Manager restart
            // cannot recover an older Reset intent.
            try {
                await this.kubernetes.patchClaimAnnotations(userId, {
                    [RESET_AFTER_DELETE_ANNOTATION]: null
                });
            } catch (error) {
                // Ignore only a verified concurrent deletion. Any other failure
                // must reject Terminate rather than acknowledge an override that
                // would be lost across a Manager restart.
                let claim;
                try {
                    claim = await this.kubernetes.getClaim(userId);
                } catch {
                    throw error;
                }
                if (claim) throw error;
            }
            const operation = this.queueOperation(
                userId,
                "DELETING",
                async () => {
                    if (!(await this.kubernetes.getClaim(userId))) return;
                    await this.destroy(userId);
                }
            );
            releaseAfterOperation = true;
            void operation.finally(() => this.removePendingDelete(userId));
            if (!wait) {
                return {
                    state: "DELETING",
                    updatedAt: new Date().toISOString()
                };
            }
            await operation;
            const completed = await this.status(userId);
            if (completed.state !== "ABSENT") {
                throw new Error("Agent Workspace cleanup did not complete");
            }
            return completed;
        } finally {
            if (!releaseAfterOperation) this.removePendingDelete(userId);
        }
    }

    async reset(userId: string): Promise<WorkspaceStatus> {
        this.queueOperation(userId, "DELETING", async (setState) => {
            if ((await this.kubernetes.status(userId)).state !== "ABSENT") {
                // Persist the Reset intent before destructive cleanup. If key
                // revocation or claim deletion fails, reconciliation can finish
                // cleanup and still provision the requested replacement.
                await this.kubernetes.patchClaimAnnotations(userId, {
                    [RESET_AFTER_DELETE_ANNOTATION]: "true"
                });
                await this.destroy(userId);
            }
            setState("ALLOCATING");
            await this.provision(userId);
        });
        return { state: "DELETING", updatedAt: new Date().toISOString() };
    }

    private async extendManagedKeyWithRetry(
        userId: string,
        keyId: string,
        expiryTime: Date
    ) {
        const delays = [100, 200, 400, 800, 1_600, 3_200, 6_400];
        for (let attempt = 0; ; attempt += 1) {
            try {
                await this.apiKeys.extend(userId, keyId, expiryTime);
                return;
            } catch (error) {
                if (attempt >= delays.length) throw error;
                await new Promise((resolve) =>
                    setTimeout(resolve, delays[attempt])
                );
            }
        }
    }

    private async persistActivityRenewal(
        userId: string,
        requestedActivity: Date
    ) {
        let claim = await this.kubernetes.getClaim(userId);
        if (!claim) return;

        const persistedActivity = new Date(
            claim.metadata.annotations?.[LAST_ACTIVITY_ANNOTATION] ||
                claim.metadata.creationTimestamp ||
                0
        );
        const effectiveActivity = new Date(
            Math.max(
                requestedActivity.getTime(),
                Number.isFinite(persistedActivity.getTime())
                    ? persistedActivity.getTime()
                    : 0
            )
        );

        if (
            !Number.isFinite(persistedActivity.getTime()) ||
            effectiveActivity.getTime() > persistedActivity.getTime()
        ) {
            // The claim is the durable source of truth. Persist it before
            // extending the credential so a restart can repair a partial
            // success without ever deriving an older expiry.
            claim = await this.kubernetes.updateActivity(
                userId,
                effectiveActivity
            );
        }

        const keyId = claim.metadata.annotations?.[KEY_ID_ANNOTATION];
        if (!keyId) return;
        const durableActivity = Date.parse(
            claim.metadata.annotations?.[LAST_ACTIVITY_ANNOTATION] || ""
        );
        const expiryBase = Number.isFinite(durableActivity)
            ? Math.max(durableActivity, effectiveActivity.getTime())
            : effectiveActivity.getTime();
        await this.extendManagedKeyWithRetry(
            userId,
            keyId,
            new Date(expiryBase + this.config.hardDeleteSeconds * 1000)
        );
    }

    async recordMeaningfulActivity(userId: string, activityTime = new Date()) {
        const prior = this.activityRenewals.get(userId) || Promise.resolve();
        let renewal: Promise<void>;
        renewal = prior
            .catch(() => undefined)
            .then(() => this.persistActivityRenewal(userId, activityTime))
            .finally(() => {
                if (this.activityRenewals.get(userId) === renewal) {
                    this.activityRenewals.delete(userId);
                }
            });
        this.activityRenewals.set(userId, renewal);
        return renewal;
    }

    private async recoverTransientClaim(
        userId: string,
        state: WorkspaceStatus["state"]
    ): Promise<boolean> {
        if (
            state !== "DELETING" &&
            state !== "ALLOCATING" &&
            state !== "BOOTSTRAPPING" &&
            state !== "SUSPENDING" &&
            state !== "RESUMING"
        ) {
            return false;
        }

        // Reconciliation shares the same per-user single-flight operation as UI
        // actions. Re-read the claim inside the lock because this pass may have
        // been queued from a stale list result.
        await this.runOnce(userId, state, async (setState) => {
            const claim = await this.kubernetes.getClaim(userId);
            if (!claim) return;
            const currentState = claim.metadata.annotations?.[
                STATE_ANNOTATION
            ] as WorkspaceStatus["state"] | undefined;
            const sandbox = claim.status?.sandbox?.name;

            if (currentState === "DELETING") {
                const resetAfterDelete =
                    claim.metadata.annotations?.[
                        RESET_AFTER_DELETE_ANNOTATION
                    ] === "true";
                await this.destroy(userId);
                if (resetAfterDelete && !this.pendingDeletes.has(userId)) {
                    setState("ALLOCATING");
                    await this.provision(userId);
                }
                return;
            }
            if (
                currentState === "ALLOCATING" ||
                currentState === "BOOTSTRAPPING"
            ) {
                // The raw managed key exists only in the in-memory bootstrap
                // payload. Cleanup remains DELETING on revocation failure.
                await this.destroy(userId);
                return;
            }
            if (currentState !== "SUSPENDING" && currentState !== "RESUMING") {
                return;
            }
            if (!sandbox) {
                await this.kubernetes.patchClaimAnnotations(userId, {
                    [STATE_ANNOTATION]: "FAILED",
                    [ERROR_ANNOTATION]:
                        "Agent Manager restarted during a lifecycle transition and the runtime is missing"
                });
                return;
            }
            try {
                if (currentState === "SUSPENDING") {
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
        });
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
                const skillSyncStatus =
                    claim.metadata.annotations?.[SKILL_SYNC_STATUS_ANNOTATION];
                const lastActivity = Date.parse(
                    claim.metadata.annotations?.[LAST_ACTIVITY_ANNOTATION] ||
                        claim.metadata.creationTimestamp ||
                        ""
                );
                if (!userId || this.operations.has(userId)) return;
                if (
                    state === "READY" &&
                    sandbox &&
                    claim.metadata.uid &&
                    (!skillSyncStatus || skillSyncStatus === "notAttempted")
                ) {
                    // Status `notAttempted` alone never implies an empty
                    // Sandbox: recovery is always non-forced.
                    this.scheduleSkillSync(
                        userId,
                        claim.metadata.uid,
                        sandbox,
                        false
                    );
                }
                if (
                    state &&
                    (await this.recoverTransientClaim(
                        userId,
                        state as WorkspaceStatus["state"]
                    ))
                ) {
                    return;
                }
                if (!Number.isFinite(lastActivity)) return;
                if (lastActivity <= deleteCutoff) {
                    // A request accepted near the boundary may already be
                    // persisting. Wait for it and re-read durable state before
                    // destructive cleanup; never act on the stale list result.
                    await this.activityRenewals
                        .get(userId)
                        ?.catch(() => undefined);
                    const currentClaim = await this.kubernetes.getClaim(userId);
                    const currentActivity = Date.parse(
                        currentClaim?.metadata.annotations?.[
                            LAST_ACTIVITY_ANNOTATION
                        ] || ""
                    );
                    if (
                        Number.isFinite(currentActivity) &&
                        currentActivity > deleteCutoff
                    ) {
                        return;
                    }
                    await this.delete(userId, true);
                    return;
                }

                // Reconciliation also repairs a managed-key extension that may
                // have failed after the claim activity was durably advanced.
                // The per-user renewal queue re-reads the claim and therefore
                // cannot overwrite a newer concurrent activity timestamp.
                await this.recordMeaningfulActivity(
                    userId,
                    new Date(lastActivity)
                );

                // A real request may have queued behind the repair above. Read
                // the durable state again before deciding to suspend so this
                // reconciliation snapshot cannot override newer activity.
                const currentClaim = await this.kubernetes.getClaim(userId);
                const currentActivity = Date.parse(
                    currentClaim?.metadata.annotations?.[
                        LAST_ACTIVITY_ANNOTATION
                    ] || ""
                );
                const currentState =
                    currentClaim?.metadata.annotations?.[STATE_ANNOTATION];
                if (
                    !sandbox ||
                    currentState !== "READY" ||
                    !Number.isFinite(currentActivity) ||
                    currentActivity > suspendCutoff
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
