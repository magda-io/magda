import { expect } from "chai";
import { AgentManager } from "../manager.js";
import {
    KEY_ID_ANNOTATION,
    LAST_ACTIVITY_ANNOTATION,
    RESET_AFTER_DELETE_ANNOTATION,
    SKILL_SYNC_ATTEMPTED_ANNOTATION,
    SKILL_SYNC_COMPLETED_ANNOTATION,
    SKILL_SYNC_COUNTS_ANNOTATION,
    SKILL_SYNC_DIAGNOSTIC_ANNOTATION,
    SKILL_SYNC_STATUS_ANNOTATION,
    shutdownTimeForActivity,
    STATE_ANNOTATION,
    USER_LABEL
} from "../kubernetes.js";
import { ManagerConfig, SandboxClaim, WorkspaceStatus } from "../types.js";
import {
    DshSessionStatusFrameParser,
    ForegroundActivityTracker
} from "../webSocketActivity.js";

const userId = "00000000-0000-4000-8000-000000000123";

function config(overrides: Partial<ManagerConfig> = {}): ManagerConfig {
    return {
        port: 8080,
        jwtSecret: "secret",
        namespace: "magda-dev-agents",
        installationId: "a1b2c3d4e5f6",
        warmPool: "magda-agent-a1b2c3d4e5f6-runc",
        authApiUrl: "http://authorization-api/v0",
        registryApiUrl: "http://registry-api/v0",
        storageApiUrl: "http://storage-api/v0",
        defaultStorageBucket: "magda-datasets",
        tenantId: 0,
        skillArchiveMaxCompressedBytes: 8 * 1024 * 1024,
        skillArchiveMaxUncompressedBytes: 32 * 1024 * 1024,
        skillArchiveMaxEntries: 256,
        skillArchiveMaxPathLength: 240,
        skillArchiveMaxNestingDepth: 8,
        skillArchiveMaxMarkdownBytes: 1024 * 1024,
        systemUserId: "00000000-0000-4000-8000-000000000000",
        managedApiKeyName: "magda-agent-workspace-a1b2c3d4e5f6",
        externalUrl: "https://magda.test",
        externalAuthority: "magda.test",
        runtimePrefix: "/v0/runtime",
        sandboxPort: 3080,
        agentContainer: "agent",
        launchTokenFile: "/token",
        bootstrapCommand: "/bootstrap",
        magdaApiUrl: "https://magda.test/api",
        llmApiUrl: "https://magda.test/api/v0/llm/v1",
        llmModel: "model",
        llmReasoningEffort: "medium",
        llmContextWindow: 1_050_000,
        llmMaxTokens: 128_000,
        hardDeleteSeconds: 8 * 60 * 60,
        idleSuspendSeconds: 30 * 60,
        reconcileIntervalSeconds: 30,
        runtimeMaxBodyBytes: 1024,
        controlPlaneSecret: "control",
        ...overrides
    };
}

function runningStatusFrame(agentId: string): Buffer {
    const payload = Buffer.from(
        JSON.stringify({
            type: "item",
            streamId: "events",
            value: {
                type: "emit",
                event: "api-session/status",
                args: [agentId, true]
            }
        })
    );
    const header =
        payload.length < 126
            ? Buffer.from([0x81, payload.length])
            : Buffer.from([
                  0x81,
                  126,
                  payload.length >> 8,
                  payload.length & 0xff
              ]);
    return Buffer.concat([header, payload]);
}

function claim(
    lastActivity: Date,
    state = "READY",
    uid = "claim-1"
): SandboxClaim {
    return {
        apiVersion: "extensions.agents.x-k8s.io/v1beta1",
        kind: "SandboxClaim",
        metadata: {
            name: "claim",
            uid,
            creationTimestamp: lastActivity.toISOString(),
            labels: { [USER_LABEL]: userId },
            annotations: {
                [STATE_ANNOTATION]: state,
                [LAST_ACTIVITY_ANNOTATION]: lastActivity.toISOString(),
                [KEY_ID_ANNOTATION]: "key-1"
            }
        },
        spec: {
            lifecycle: {
                shutdownPolicy: "DeleteForeground",
                shutdownTime: shutdownTimeForActivity(
                    lastActivity,
                    config().hardDeleteSeconds
                )
            }
        },
        status: { sandbox: { name: "sandbox-1" } }
    };
}

class FakeKubernetes {
    claims: SandboxClaim[] = [];
    modes: string[] = [];
    activity: Array<{ userId: string; at: Date }> = [];
    activityAttempts = 0;
    activityFailures = 0;
    deleted = 0;
    bootstraps: unknown[] = [];
    skillSyncCalls: string[] = [];
    skillSyncForce: boolean[] = [];
    skillSyncPatches: Array<{
        claimUid: string;
        annotations: Record<string, string | null>;
    }> = [];
    skillSyncImplementations: Array<() => Promise<string>> = [];
    rejectedSkillSyncPatches = 0;
    deleteBarrier: Promise<void> | undefined;
    annotationFailures = 0;
    createdClaims = 0;

    async listClaims() {
        return this.claims;
    }
    async getClaim(id: string) {
        return id === userId ? this.claims[0] : undefined;
    }
    async status(): Promise<WorkspaceStatus> {
        const current = this.claims[0];
        if (!current) return { state: "ABSENT" };
        return {
            state: (current.metadata.annotations?.[STATE_ANNOTATION] ||
                "READY") as WorkspaceStatus["state"]
        };
    }
    async patchClaimAnnotations(
        _id: string,
        annotations: Record<string, string | null>
    ) {
        if (this.annotationFailures > 0) {
            this.annotationFailures -= 1;
            throw new Error("Kubernetes annotation patch unavailable");
        }
        const current = this.claims[0];
        if (!current.metadata.annotations) current.metadata.annotations = {};
        for (const [name, value] of Object.entries(annotations)) {
            if (value === null) delete current.metadata.annotations[name];
            else current.metadata.annotations[name] = value;
        }
        return current;
    }
    async patchSkillSyncAnnotations(
        _id: string,
        claimUid: string,
        annotations: Record<string, string | null>
    ) {
        const current = this.claims[0];
        if (
            current?.metadata.uid !== claimUid ||
            current.metadata.annotations?.[STATE_ANNOTATION] !== "READY"
        ) {
            this.rejectedSkillSyncPatches += 1;
            throw new Error("stale skill sync claim");
        }
        this.skillSyncPatches.push({ claimUid, annotations });
        if (!current.metadata.annotations) current.metadata.annotations = {};
        for (const [name, value] of Object.entries(annotations)) {
            if (value === null) delete current.metadata.annotations[name];
            else current.metadata.annotations[name] = value;
        }
        return current;
    }
    async updateActivity(id: string, at: Date) {
        this.activityAttempts += 1;
        if (this.activityFailures > 0) {
            this.activityFailures -= 1;
            throw new Error("Kubernetes activity update unavailable");
        }
        this.activity.push({ userId: id, at });
        if (this.claims[0]) {
            this.claims[0].metadata.annotations![
                LAST_ACTIVITY_ANNOTATION
            ] = at.toISOString();
            this.claims[0].spec = {
                ...this.claims[0].spec,
                lifecycle: {
                    shutdownPolicy: "DeleteForeground",
                    shutdownTime: shutdownTimeForActivity(
                        at,
                        config().hardDeleteSeconds
                    )
                }
            };
        }
        return this.claims[0];
    }
    async setSandboxOperatingMode(_name: string, mode: string) {
        this.modes.push(mode);
        if (mode === "Suspended") {
            this.claims[0].metadata.annotations![STATE_ANNOTATION] =
                "SUSPENDED";
        }
    }
    async createClaim() {
        this.createdClaims += 1;
        this.claims = [
            claim(new Date(), "ALLOCATING", `claim-${this.createdClaims}`)
        ];
        return { claim: this.claims[0], created: true };
    }
    async waitForClaimReady() {
        return this.claims[0];
    }
    async waitForPodReady() {}
    async containerRestartCount() {
        return 0;
    }
    async bootstrap(_sandbox: string, payload: unknown) {
        this.bootstraps.push(payload);
    }
    async syncSkills(sandbox: string, options: { force: boolean }) {
        this.skillSyncCalls.push(sandbox);
        this.skillSyncForce.push(options.force);
        const implementation = this.skillSyncImplementations.shift();
        if (implementation) return await implementation();
        return JSON.stringify({
            status: "success",
            counts: {
                installed: 0,
                updated: 0,
                unchanged: 0,
                removed: 0,
                skipped: 0,
                failed: 0
            }
        });
    }
    async deleteClaim() {
        this.deleted += 1;
        await this.deleteBarrier;
        this.claims = [];
    }
}

class FakeApiKeys {
    extended: Date[] = [];
    extendAttempts: Date[] = [];
    extendFailures = 0;
    deleted = 0;
    deleteError: Error | undefined;
    rotated = 0;
    async rotate() {
        this.rotated += 1;
        return { id: `key-${this.rotated + 1}`, key: "secret" };
    }
    async extend(_userId: string, _keyId: string, expiry: Date) {
        this.extendAttempts.push(expiry);
        if (this.extendFailures > 0) {
            this.extendFailures -= 1;
            throw new Error("Authorization API unavailable");
        }
        this.extended.push(expiry);
    }
    async delete() {
        this.deleted += 1;
        if (this.deleteError) throw this.deleteError;
    }
}

class FakeProxy {
    closed = 0;
    async closeUserSockets() {
        this.closed += 1;
    }
}

async function waitFor(predicate: () => boolean) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        if (predicate()) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error("Timed out waiting for lifecycle test condition");
}

function manager(
    kubernetes: FakeKubernetes,
    keys = new FakeApiKeys(),
    configOverrides: Partial<ManagerConfig> = {}
) {
    return {
        manager: new AgentManager(
            config(configOverrides),
            kubernetes as never,
            keys as never,
            new FakeProxy() as never
        ),
        keys
    };
}

describe("Agent Workspace inactivity lifecycle", () => {
    it("bootstraps the deployment-owned model capabilities", async () => {
        const kubernetes = new FakeKubernetes();
        const instance = manager(kubernetes).manager;

        await instance.start(userId);
        for (let i = 0; i < 20 && !kubernetes.bootstraps.length; i += 1) {
            await new Promise((resolve) => setImmediate(resolve));
        }

        expect(kubernetes.bootstraps).to.have.length(1);
        expect(kubernetes.bootstraps[0]).to.have.nested.include({
            "llm.model": "model",
            "llm.reasoningEffort": "medium",
            "llm.contextWindow": 1_050_000,
            "llm.maxTokens": 128_000
        });
    });

    it("omits an explicitly empty reasoning effort from bootstrap", async () => {
        const kubernetes = new FakeKubernetes();
        const instance = manager(kubernetes, new FakeApiKeys(), {
            llmReasoningEffort: ""
        }).manager;

        await instance.start(userId);
        for (let i = 0; i < 20 && !kubernetes.bootstraps.length; i += 1) {
            await new Promise((resolve) => setImmediate(resolve));
        }

        expect(kubernetes.bootstraps).to.have.length(1);
        const payload = kubernetes.bootstraps[0] as {
            llm: Record<string, unknown>;
        };
        expect(payload.llm).not.to.have.property("reasoningEffort");
    });

    it("becomes READY before a blocked Agent Skill sync completes", async () => {
        const kubernetes = new FakeKubernetes();
        let releaseSync!: () => void;
        const blockedSync = new Promise<void>((resolve) => {
            releaseSync = resolve;
        });
        kubernetes.skillSyncImplementations.push(async () => {
            await blockedSync;
            return JSON.stringify({
                status: "success",
                counts: {
                    installed: 1,
                    updated: 0,
                    unchanged: 0,
                    removed: 0,
                    skipped: 0,
                    failed: 0
                }
            });
        });
        const instance = manager(kubernetes).manager;

        await instance.start(userId);
        await waitFor(() => kubernetes.skillSyncCalls.length === 1);
        // A claim this provisioning call created is a fresh, empty Sandbox.
        expect(kubernetes.skillSyncForce).to.deep.equal([true]);

        expect(
            kubernetes.claims[0].metadata.annotations?.[STATE_ANNOTATION]
        ).to.equal("READY");
        expect((await instance.start(userId)).state).to.equal("READY");
        expect(
            kubernetes.claims[0].metadata.annotations?.[
                SKILL_SYNC_STATUS_ANNOTATION
            ]
        ).to.equal("notAttempted");
        expect(
            kubernetes.claims[0].metadata.annotations?.[
                SKILL_SYNC_ATTEMPTED_ANNOTATION
            ]
        ).to.be.a("string");
        expect(
            kubernetes.claims[0].metadata.annotations?.[
                SKILL_SYNC_COMPLETED_ANNOTATION
            ]
        ).to.equal(undefined);

        releaseSync();
        await waitFor(
            () =>
                kubernetes.claims[0].metadata.annotations?.[
                    SKILL_SYNC_STATUS_ANNOTATION
                ] === "success"
        );
    });

    it("keeps the workspace READY and records a failed Agent Skill sync", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.skillSyncImplementations.push(async () => {
            throw new Error("mgd sync failed");
        });
        const instance = manager(kubernetes).manager;

        await instance.start(userId);
        await waitFor(
            () =>
                kubernetes.claims[0].metadata.annotations?.[
                    SKILL_SYNC_STATUS_ANNOTATION
                ] === "failed"
        );

        expect(
            kubernetes.claims[0].metadata.annotations?.[STATE_ANNOTATION]
        ).to.equal("READY");
        expect((await instance.start(userId)).state).to.equal("READY");
        expect(
            kubernetes.claims[0].metadata.annotations?.[
                SKILL_SYNC_DIAGNOSTIC_ANNOTATION
            ]
        ).to.equal("EXEC_FAILED");
        expect(
            JSON.parse(
                kubernetes.claims[0].metadata.annotations?.[
                    SKILL_SYNC_COUNTS_ANNOTATION
                ] || "null"
            )
        ).to.deep.equal({
            installed: 0,
            updated: 0,
            unchanged: 0,
            removed: 0,
            skipped: 0,
            failed: 1
        });
        expect(
            kubernetes.claims[0].metadata.annotations?.[
                SKILL_SYNC_COMPLETED_ANNOTATION
            ]
        ).to.be.a("string");
    });

    it("persists successful and partial Agent Skill sync results", async () => {
        for (const [status, counts] of [
            [
                "success",
                {
                    installed: 2,
                    updated: 1,
                    unchanged: 3,
                    removed: 4,
                    skipped: 5,
                    failed: 0
                }
            ],
            [
                "partial",
                {
                    installed: 1,
                    updated: 0,
                    unchanged: 2,
                    removed: 0,
                    skipped: 3,
                    failed: 1
                }
            ]
        ] as const) {
            const kubernetes = new FakeKubernetes();
            kubernetes.skillSyncImplementations.push(async () =>
                JSON.stringify({ status, counts })
            );

            await manager(kubernetes).manager.start(userId);
            await waitFor(
                () =>
                    kubernetes.claims[0].metadata.annotations?.[
                        SKILL_SYNC_STATUS_ANNOTATION
                    ] === status
            );

            expect(
                JSON.parse(
                    kubernetes.claims[0].metadata.annotations?.[
                        SKILL_SYNC_COUNTS_ANNOTATION
                    ] || "null"
                ),
                status
            ).to.deep.equal(counts);
            expect(
                kubernetes.claims[0].metadata.annotations?.[
                    SKILL_SYNC_COMPLETED_ANNOTATION
                ],
                status
            ).to.be.a("string");
            expect(
                kubernetes.claims[0].metadata.annotations?.[
                    SKILL_SYNC_DIAGNOSTIC_ANNOTATION
                ],
                status
            ).to.equal("");
        }
    });

    it("does not let a stale claim UID sync result annotate a reset replacement", async () => {
        const kubernetes = new FakeKubernetes();
        let releaseOldSync!: () => void;
        let releaseReplacementSync!: () => void;
        const oldSyncBlocked = new Promise<void>((resolve) => {
            releaseOldSync = resolve;
        });
        const replacementSyncBlocked = new Promise<void>((resolve) => {
            releaseReplacementSync = resolve;
        });
        kubernetes.skillSyncImplementations.push(
            async () => {
                await oldSyncBlocked;
                return JSON.stringify({
                    status: "success",
                    counts: {
                        installed: 99,
                        updated: 0,
                        unchanged: 0,
                        removed: 0,
                        skipped: 0,
                        failed: 0
                    }
                });
            },
            async () => {
                await replacementSyncBlocked;
                return JSON.stringify({
                    status: "success",
                    counts: {
                        installed: 0,
                        updated: 0,
                        unchanged: 1,
                        removed: 0,
                        skipped: 0,
                        failed: 0
                    }
                });
            }
        );
        const instance = manager(kubernetes).manager;

        await instance.start(userId);
        await waitFor(() => kubernetes.skillSyncCalls.length === 1);
        const oldUid = kubernetes.claims[0].metadata.uid;

        await instance.reset(userId);
        await waitFor(
            () =>
                kubernetes.createdClaims === 2 &&
                kubernetes.claims[0].metadata.annotations?.[
                    STATE_ANNOTATION
                ] === "READY" &&
                kubernetes.skillSyncCalls.length === 2
        );
        const replacementUid = kubernetes.claims[0].metadata.uid;
        expect(replacementUid).not.to.equal(oldUid);
        // Reset provisions a brand-new claim/PVC, so both syncs are forced.
        expect(kubernetes.skillSyncForce).to.deep.equal([true, true]);

        releaseOldSync();
        await waitFor(() => kubernetes.rejectedSkillSyncPatches > 0);

        expect(
            kubernetes.skillSyncPatches.some(
                ({ claimUid, annotations }) =>
                    claimUid === oldUid &&
                    annotations[SKILL_SYNC_STATUS_ANNOTATION] === "success"
            )
        ).to.equal(false);
        expect(
            kubernetes.claims[0].metadata.annotations?.[
                SKILL_SYNC_STATUS_ANNOTATION
            ]
        ).to.equal("notAttempted");
        expect(
            kubernetes.claims[0].metadata.annotations?.[
                SKILL_SYNC_COUNTS_ANNOTATION
            ]
        ).to.equal(undefined);

        releaseReplacementSync();
        await waitFor(
            () =>
                kubernetes.claims[0].metadata.annotations?.[
                    SKILL_SYNC_STATUS_ANNOTATION
                ] === "success"
        );
    });

    it("never forces skill sync when provisioning reattaches an existing claim", async () => {
        const kubernetes = new FakeKubernetes();
        const createClaim = kubernetes.createClaim.bind(kubernetes);
        kubernetes.createClaim = async () => ({
            ...(await createClaim()),
            created: false
        });
        const instance = manager(kubernetes).manager;

        await instance.start(userId);
        await waitFor(() => kubernetes.skillSyncCalls.length === 1);

        expect(kubernetes.skillSyncForce).to.deep.equal([false]);
    });

    it("reconciliation schedules a persisted notAttempted Agent Skill sync", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [claim(new Date())];
        kubernetes.claims[0].metadata.annotations![
            SKILL_SYNC_STATUS_ANNOTATION
        ] = "notAttempted";
        let releaseSync!: () => void;
        const blockedSync = new Promise<void>((resolve) => {
            releaseSync = resolve;
        });
        kubernetes.skillSyncImplementations.push(async () => {
            await blockedSync;
            return JSON.stringify({
                status: "success",
                counts: {
                    installed: 0,
                    updated: 0,
                    unchanged: 1,
                    removed: 0,
                    skipped: 0,
                    failed: 0
                }
            });
        });
        const instance = manager(kubernetes).manager;

        await instance.reconcileIdleWorkspaces();

        expect(kubernetes.skillSyncCalls).to.deep.equal(["sandbox-1"]);
        // Recovery of an existing claim never force-discards local edits.
        expect(kubernetes.skillSyncForce).to.deep.equal([false]);
        expect(
            kubernetes.claims[0].metadata.annotations?.[
                SKILL_SYNC_ATTEMPTED_ANNOTATION
            ]
        ).to.be.a("string");
        releaseSync();
        await waitFor(
            () =>
                kubernetes.claims[0].metadata.annotations?.[
                    SKILL_SYNC_STATUS_ANNOTATION
                ] === "success"
        );
    });

    it("suspends after 30 minutes even when transport sockets are open", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [claim(new Date(Date.now() - 31 * 60 * 1000))];
        const instance = manager(kubernetes).manager;

        await instance.reconcileIdleWorkspaces();

        expect(kubernetes.modes).to.deep.equal(["Suspended"]);
        expect(
            kubernetes.claims[0].metadata.annotations?.[STATE_ANNOTATION]
        ).to.equal("SUSPENDED");
    });

    it("keeps a parsed foreground turn ready across the suspension threshold", async () => {
        const started = new Date("2026-10-10T12:00:00.000Z");
        const foregroundRenewal = new Date("2026-10-10T12:20:00.000Z");
        let now = started;
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [claim(started)];
        const instance = manager(kubernetes).manager;
        let lastRenewal = Promise.resolve();
        const tracker = new ForegroundActivityTracker(
            async (id, at) => {
                lastRenewal = instance.recordMeaningfulActivity(id, at);
                await lastRenewal;
            },
            60 * 60 * 1000,
            () => now
        );
        const parser = new DshSessionStatusFrameParser(({ agentId, running }) =>
            tracker.status(userId, agentId, running)
        );

        parser.push(runningStatusFrame("agent-1"));
        await lastRenewal;
        now = foregroundRenewal;
        tracker.renewActive(userId);
        await lastRenewal;

        const originalNow = Date.now;
        Date.now = () => new Date("2026-10-10T12:31:00.000Z").getTime();
        try {
            await instance.reconcileIdleWorkspaces();
        } finally {
            Date.now = originalNow;
            tracker.close();
        }

        expect(kubernetes.modes).to.deep.equal([]);
        expect(
            kubernetes.claims[0].metadata.annotations?.[
                LAST_ACTIVITY_ANNOTATION
            ]
        ).to.equal(foregroundRenewal.toISOString());
    });

    it("renews both the claim deadline and managed credential", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [claim(new Date("2026-10-10T03:00:00.000Z"))];
        const { manager: instance, keys } = manager(kubernetes);
        const activityTime = new Date("2026-10-10T12:00:00.000Z");

        await instance.recordMeaningfulActivity(userId, activityTime);

        expect(kubernetes.activity[0]).to.deep.equal({
            userId,
            at: activityTime
        });
        expect(keys.extended[0].toISOString()).to.equal(
            "2026-10-10T20:00:00.000Z"
        );

        const originalNow = Date.now;
        Date.now = () => activityTime.getTime();
        try {
            await instance.reconcileIdleWorkspaces();
        } finally {
            Date.now = originalNow;
        }
        expect(kubernetes.deleted).to.equal(0);
    });

    it("persists the claim before extending the managed credential", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [claim(new Date("2026-10-10T11:00:00.000Z"))];
        const keys = new FakeApiKeys();
        const order: string[] = [];
        const updateActivity = kubernetes.updateActivity.bind(kubernetes);
        kubernetes.updateActivity = async (id, at) => {
            order.push("claim");
            return updateActivity(id, at);
        };
        const extend = keys.extend.bind(keys);
        keys.extend = async (id, keyId, expiry) => {
            order.push("key");
            return extend(id, keyId, expiry);
        };

        await manager(kubernetes, keys).manager.recordMeaningfulActivity(
            userId,
            new Date("2026-10-10T12:00:00.000Z")
        );

        expect(order).to.deep.equal(["claim", "key"]);
    });

    it("retries after a transient Kubernetes persistence failure", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [claim(new Date("2026-10-10T11:00:00.000Z"))];
        kubernetes.activityFailures = 1;
        const { manager: instance, keys } = manager(kubernetes);
        const activityTime = new Date("2026-10-10T12:00:00.000Z");

        let failure: unknown;
        try {
            await instance.recordMeaningfulActivity(userId, activityTime);
        } catch (error) {
            failure = error;
        }
        expect((failure as Error).message).to.equal(
            "Kubernetes activity update unavailable"
        );
        expect(keys.extendAttempts).to.have.length(0);

        await instance.recordMeaningfulActivity(userId, activityTime);
        expect(kubernetes.activityAttempts).to.equal(2);
        expect(kubernetes.activity).to.have.length(1);
        expect(keys.extended).to.have.length(1);
    });

    it("automatically retries credential extension after partial success", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [claim(new Date("2026-10-10T11:00:00.000Z"))];
        const keys = new FakeApiKeys();
        keys.extendFailures = 3;
        const instance = manager(kubernetes, keys).manager;
        const activityTime = new Date("2026-10-10T12:00:00.000Z");

        await instance.recordMeaningfulActivity(userId, activityTime);

        expect(kubernetes.activity).to.have.length(1);
        expect(keys.extendAttempts).to.have.length(4);
        expect(keys.extended[0].toISOString()).to.equal(
            "2026-10-10T20:00:00.000Z"
        );
    });

    it("serializes concurrent activity without shortening either deadline", async () => {
        for (const [first, second, expectedClaimUpdates] of [
            [
                new Date("2026-10-10T12:00:00.000Z"),
                new Date("2026-10-10T11:30:00.000Z"),
                ["2026-10-10T12:00:00.000Z"]
            ],
            [
                new Date("2026-10-10T11:30:00.000Z"),
                new Date("2026-10-10T12:00:00.000Z"),
                ["2026-10-10T11:30:00.000Z", "2026-10-10T12:00:00.000Z"]
            ]
        ] as const) {
            const kubernetes = new FakeKubernetes();
            kubernetes.claims = [claim(new Date("2026-10-10T11:00:00.000Z"))];
            const { manager: instance, keys } = manager(kubernetes);

            await Promise.all([
                instance.recordMeaningfulActivity(userId, first),
                instance.recordMeaningfulActivity(userId, second)
            ]);

            expect(
                kubernetes.activity.map(({ at }) => at.toISOString())
            ).to.deep.equal(expectedClaimUpdates);
            const expiryTimes = keys.extendAttempts.map((at) => at.getTime());
            expect(expiryTimes).to.deep.equal(
                [...expiryTimes].sort((left, right) => left - right)
            );
            expect(kubernetes.claims[0].spec?.lifecycle?.shutdownTime).to.equal(
                "2026-10-10T20:00:00.000Z"
            );
            expect(keys.extendAttempts.at(-1)?.toISOString()).to.equal(
                "2026-10-10T20:00:00.000Z"
            );
        }
    });

    it("repairs credential expiry from persisted activity after restart", async () => {
        const persistedActivity = new Date("2026-10-10T12:00:00.000Z");
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [claim(persistedActivity)];
        const keys = new FakeApiKeys();
        const originalNow = Date.now;
        Date.now = () => new Date("2026-10-10T12:05:00.000Z").getTime();
        try {
            await manager(kubernetes, keys).manager.reconcileIdleWorkspaces();
        } finally {
            Date.now = originalNow;
        }

        expect(kubernetes.activity).to.have.length(0);
        expect(keys.extended).to.have.length(1);
        expect(keys.extended[0].toISOString()).to.equal(
            "2026-10-10T20:00:00.000Z"
        );
    });

    it("waits for concurrent near-expiry activity before hard deletion", async () => {
        const now = new Date("2026-10-10T20:00:00.000Z");
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [
            claim(new Date(now.getTime() - config().hardDeleteSeconds * 1000))
        ];
        const originalUpdate = kubernetes.updateActivity.bind(kubernetes);
        let release!: () => void;
        const blocked = new Promise<void>((resolve) => {
            release = resolve;
        });
        kubernetes.updateActivity = async (id, at) => {
            await blocked;
            return originalUpdate(id, at);
        };
        const instance = manager(kubernetes).manager;
        const renewal = instance.recordMeaningfulActivity(userId, now);
        const originalNow = Date.now;
        Date.now = () => now.getTime();
        try {
            const reconciliation = instance.reconcileIdleWorkspaces();
            await Promise.resolve();
            release();
            await Promise.all([renewal, reconciliation]);
        } finally {
            Date.now = originalNow;
        }

        expect(kubernetes.deleted).to.equal(0);
        expect(
            kubernetes.claims[0].metadata.annotations?.[
                LAST_ACTIVITY_ANNOTATION
            ]
        ).to.equal(now.toISOString());
    });

    it("renews activity close to expiry without deleting the workspace", async () => {
        const now = new Date("2026-10-10T20:00:00.000Z");
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [
            claim(
                new Date(now.getTime() - config().hardDeleteSeconds * 1000 + 1)
            )
        ];
        const { manager: instance, keys } = manager(kubernetes);

        await instance.recordMeaningfulActivity(userId, now);
        const originalNow = Date.now;
        Date.now = () => now.getTime();
        try {
            await instance.reconcileIdleWorkspaces();
        } finally {
            Date.now = originalNow;
        }

        expect(kubernetes.deleted).to.equal(0);
        expect(
            kubernetes.claims[0].metadata.annotations?.[
                LAST_ACTIVITY_ANNOTATION
            ]
        ).to.equal(now.toISOString());
        expect(
            keys.extendAttempts.every(
                (expiry) => expiry.toISOString() === "2026-10-11T04:00:00.000Z"
            )
        ).to.equal(true);
    });

    it("uses persisted activity after a Manager restart", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [claim(new Date(Date.now() - 10 * 60 * 1000))];

        await manager(kubernetes).manager.reconcileIdleWorkspaces();
        await manager(kubernetes).manager.reconcileIdleWorkspaces();

        expect(kubernetes.modes).to.deep.equal([]);
        expect(kubernetes.deleted).to.equal(0);
    });

    it("resumes and renews the inactivity deadline", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [
            claim(new Date(Date.now() - 60 * 60 * 1000), "SUSPENDED")
        ];
        const { manager: instance, keys } = manager(kubernetes);

        expect((await instance.resume(userId)).state).to.equal("RESUMING");
        for (let i = 0; i < 20 && !kubernetes.activity.length; i += 1) {
            await new Promise((resolve) => setImmediate(resolve));
        }

        expect(kubernetes.modes).to.include("Running");
        expect(kubernetes.activity).to.have.length(1);
        expect(keys.extended).to.have.length(1);
    });

    it("recovers persisted suspend and resume transitions after restart", async () => {
        for (const [state, expectedMode, expectedState] of [
            ["SUSPENDING", "Suspended", "SUSPENDED"],
            ["RESUMING", "Running", "READY"]
        ] as const) {
            const kubernetes = new FakeKubernetes();
            kubernetes.claims = [claim(new Date(), state)];
            const { manager: instance, keys } = manager(kubernetes);

            await instance.reconcileIdleWorkspaces();

            expect(kubernetes.modes).to.deep.equal([expectedMode]);
            expect(
                kubernetes.claims[0].metadata.annotations?.[STATE_ANNOTATION]
            ).to.equal(expectedState);
            expect(keys.extended).to.have.length(state === "RESUMING" ? 1 : 0);
        }
    });

    it("destroys interrupted provisioning after revoking its credential", async () => {
        for (const state of ["ALLOCATING", "BOOTSTRAPPING"]) {
            const kubernetes = new FakeKubernetes();
            kubernetes.claims = [claim(new Date(), state)];
            const { manager: instance, keys } = manager(kubernetes);

            await instance.reconcileIdleWorkspaces();

            expect(keys.deleted).to.equal(1);
            expect(kubernetes.deleted).to.equal(1);
            expect(kubernetes.claims).to.have.length(0);
        }
    });

    it("keeps failed Terminate and Reset cleanup retryable", async () => {
        for (const action of ["terminate", "reset"] as const) {
            const kubernetes = new FakeKubernetes();
            kubernetes.claims = [claim(new Date())];
            if (action === "terminate") {
                kubernetes.claims[0].metadata.annotations![
                    RESET_AFTER_DELETE_ANNOTATION
                ] = "true";
            }
            const keys = new FakeApiKeys();
            keys.deleteError = new Error("authorization API unavailable");
            const instance = manager(kubernetes, keys).manager;
            const originalError = console.error;
            console.error = () => undefined;
            try {
                if (action === "terminate") {
                    await instance.delete(userId);
                } else {
                    await instance.reset(userId);
                }
                for (let i = 0; i < 20 && !keys.deleted; i += 1) {
                    await new Promise((resolve) => setImmediate(resolve));
                }
                await new Promise((resolve) => setImmediate(resolve));
            } finally {
                console.error = originalError;
            }

            expect(kubernetes.deleted, action).to.equal(0);
            expect(
                kubernetes.claims[0].metadata.annotations?.[STATE_ANNOTATION],
                action
            ).to.equal("DELETING");
            expect(
                kubernetes.claims[0].metadata.annotations?.[KEY_ID_ANNOTATION],
                action
            ).to.equal("key-1");
            expect(
                kubernetes.claims[0].metadata.annotations?.[
                    RESET_AFTER_DELETE_ANNOTATION
                ],
                action
            ).to.equal(action === "reset" ? "true" : undefined);

            keys.deleteError = undefined;
            await instance.reconcileIdleWorkspaces();
            expect(kubernetes.deleted, action).to.equal(1);
            if (action === "terminate") {
                expect(kubernetes.claims, action).to.have.length(0);
                expect(keys.rotated, action).to.equal(0);
            } else {
                expect(kubernetes.claims, action).to.have.length(1);
                expect(
                    kubernetes.claims[0].metadata.annotations?.[
                        STATE_ANNOTATION
                    ],
                    action
                ).to.equal("READY");
                expect(
                    kubernetes.claims[0].metadata.annotations?.[
                        KEY_ID_ANNOTATION
                    ],
                    action
                ).to.equal("key-2");
                expect(keys.rotated, action).to.equal(1);
            }
        }
    });

    it("single-flights overlapping Reset recovery passes", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [claim(new Date(), "DELETING")];
        kubernetes.claims[0].metadata.annotations![
            RESET_AFTER_DELETE_ANNOTATION
        ] = "true";
        let releaseDelete!: () => void;
        kubernetes.deleteBarrier = new Promise<void>((resolve) => {
            releaseDelete = resolve;
        });
        const { manager: instance, keys } = manager(kubernetes);

        const first = instance.reconcileIdleWorkspaces();
        for (let i = 0; i < 20 && !kubernetes.deleted; i += 1) {
            await new Promise((resolve) => setImmediate(resolve));
        }
        const second = instance.reconcileIdleWorkspaces();
        releaseDelete();
        await Promise.all([first, second]);

        expect(kubernetes.deleted).to.equal(1);
        expect(keys.rotated).to.equal(1);
        expect(kubernetes.claims).to.have.length(1);
        expect(
            kubernetes.claims[0].metadata.annotations?.[STATE_ANNOTATION]
        ).to.equal("READY");
    });

    it("lets Terminate cancel an in-flight Reset recovery", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [claim(new Date(), "DELETING")];
        kubernetes.claims[0].metadata.annotations![
            RESET_AFTER_DELETE_ANNOTATION
        ] = "true";
        let releaseDelete!: () => void;
        kubernetes.deleteBarrier = new Promise<void>((resolve) => {
            releaseDelete = resolve;
        });
        const { manager: instance, keys } = manager(kubernetes);

        const recovery = instance.reconcileIdleWorkspaces();
        for (let i = 0; i < 20 && !kubernetes.deleted; i += 1) {
            await new Promise((resolve) => setImmediate(resolve));
        }
        const termination = instance.delete(userId, true);
        await new Promise((resolve) => setImmediate(resolve));
        releaseDelete();
        await Promise.all([recovery, termination]);

        expect(kubernetes.deleted).to.equal(1);
        expect(keys.rotated).to.equal(0);
        expect(kubernetes.claims).to.have.length(0);
    });

    it("does not acknowledge Terminate until Reset intent is durably cleared", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [claim(new Date(), "DELETING")];
        kubernetes.claims[0].metadata.annotations![
            RESET_AFTER_DELETE_ANNOTATION
        ] = "true";
        kubernetes.annotationFailures = 1;
        const keys = new FakeApiKeys();
        const instance = manager(kubernetes, keys).manager;

        let rejected = false;
        try {
            await instance.delete(userId);
        } catch {
            rejected = true;
        }
        expect(rejected).to.equal(true);
        expect(
            kubernetes.claims[0].metadata.annotations?.[
                RESET_AFTER_DELETE_ANNOTATION
            ]
        ).to.equal("true");
        expect(kubernetes.deleted).to.equal(0);

        keys.deleteError = new Error("authorization API unavailable");
        const originalError = console.error;
        console.error = () => undefined;
        try {
            await instance.delete(userId);
            for (let i = 0; i < 20 && !keys.deleted; i += 1) {
                await new Promise((resolve) => setImmediate(resolve));
            }
            await new Promise((resolve) => setImmediate(resolve));
        } finally {
            console.error = originalError;
        }
        expect(
            kubernetes.claims[0].metadata.annotations?.[
                RESET_AFTER_DELETE_ANNOTATION
            ]
        ).to.equal(undefined);
        expect(
            kubernetes.claims[0].metadata.annotations?.[STATE_ANNOTATION]
        ).to.equal("DELETING");

        keys.deleteError = undefined;
        await manager(kubernetes, keys).manager.reconcileIdleWorkspaces();
        expect(kubernetes.claims).to.have.length(0);
        expect(keys.rotated).to.equal(0);
    });

    it("retries interrupted cleanup without losing key identity", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [claim(new Date(), "BOOTSTRAPPING")];
        const keys = new FakeApiKeys();
        keys.deleteError = new Error("authorization API unavailable");

        const originalError = console.error;
        console.error = () => undefined;
        try {
            await manager(kubernetes, keys).manager.reconcileIdleWorkspaces();
        } finally {
            console.error = originalError;
        }

        expect(kubernetes.deleted).to.equal(0);
        expect(
            kubernetes.claims[0].metadata.annotations?.[STATE_ANNOTATION]
        ).to.equal("DELETING");
        expect(
            kubernetes.claims[0].metadata.annotations?.[KEY_ID_ANNOTATION]
        ).to.equal("key-1");

        keys.deleteError = undefined;
        await manager(kubernetes, keys).manager.reconcileIdleWorkspaces();
        expect(kubernetes.deleted).to.equal(1);
        expect(kubernetes.claims).to.have.length(0);
    });

    it("resumes an interrupted delete immediately after restart", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [claim(new Date(), "DELETING")];
        const { manager: instance, keys } = manager(kubernetes);

        await instance.reconcileIdleWorkspaces();

        expect(keys.deleted).to.equal(1);
        expect(kubernetes.deleted).to.equal(1);
        expect(kubernetes.claims).to.have.length(0);
    });

    it("permanently deletes claim, PVC owner and credential after eight idle hours", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [
            claim(new Date(Date.now() - 8 * 60 * 60 * 1000 - 1000))
        ];
        const { manager: instance, keys } = manager(kubernetes);

        await instance.reconcileIdleWorkspaces();

        expect(kubernetes.deleted).to.equal(1);
        expect(keys.deleted).to.equal(1);
        expect(kubernetes.claims).to.have.length(0);
    });
});
