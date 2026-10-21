import { expect } from "chai";
import { AgentManager, WorkspaceRequestError } from "../manager.js";
import {
    SKILL_SYNC_COUNTS_ANNOTATION,
    SKILL_SYNC_DIAGNOSTIC_ANNOTATION,
    SKILL_SYNC_PROBLEMS_ANNOTATION,
    SKILL_SYNC_STATUS_ANNOTATION,
    STATE_ANNOTATION,
    USER_LABEL,
    skillSyncStatus
} from "../kubernetes.js";
import {
    SKILL_SYNC_MAX_PROBLEMS,
    parseSkillSyncSummary
} from "../skillSyncSummary.js";
import { ManagerConfig, SandboxClaim, WorkspaceStatus } from "../types.js";

const userId = "00000000-0000-4000-8000-000000000123";
const otherUserId = "00000000-0000-4000-8000-000000000999";

const counts = (overrides: Record<string, number> = {}) => ({
    installed: 0,
    updated: 0,
    unchanged: 0,
    removed: 0,
    skipped: 0,
    failed: 0,
    ...overrides
});

function readyClaim(uid = "claim-1", owner = userId): SandboxClaim {
    return {
        apiVersion: "extensions.agents.x-k8s.io/v1beta1",
        kind: "SandboxClaim",
        metadata: {
            name: "claim",
            uid,
            labels: { [USER_LABEL]: owner },
            annotations: {
                [STATE_ANNOTATION]: "READY",
                [SKILL_SYNC_STATUS_ANNOTATION]: "failed",
                [SKILL_SYNC_COUNTS_ANNOTATION]: JSON.stringify(
                    counts({ failed: 1 })
                ),
                [SKILL_SYNC_DIAGNOSTIC_ANNOTATION]: "EXEC_FAILED"
            }
        },
        status: { sandbox: { name: "sandbox-1" } }
    };
}

/** Records every Sandbox exec and enforces claim-UID/READY CAS on writes. */
class FakeKubernetes {
    claim: SandboxClaim | undefined = readyClaim();
    syncCalls: Array<{ sandbox: string; force: boolean }> = [];
    activeSyncs = 0;
    maxConcurrentSyncs = 0;
    rejectedPatches = 0;
    syncImplementations: Array<() => Promise<string>> = [];

    async getClaim(id: string) {
        return id === userId ? this.claim : undefined;
    }
    async listClaims() {
        return this.claim ? [this.claim] : [];
    }
    async status(): Promise<WorkspaceStatus> {
        if (!this.claim) return { state: "ABSENT" };
        return {
            state: this.claim.metadata.annotations![
                STATE_ANNOTATION
            ] as WorkspaceStatus["state"],
            skillSync: skillSyncStatus(this.claim.metadata.annotations || {})
        };
    }
    async patchSkillSyncAnnotations(
        _id: string,
        claimUid: string,
        annotations: Record<string, string | null>
    ) {
        if (
            this.claim?.metadata.uid !== claimUid ||
            this.claim.metadata.annotations?.[STATE_ANNOTATION] !== "READY"
        ) {
            this.rejectedPatches += 1;
            throw new Error("stale claim");
        }
        for (const [name, value] of Object.entries(annotations)) {
            if (value === null) delete this.claim.metadata.annotations![name];
            else this.claim.metadata.annotations![name] = value;
        }
        return this.claim;
    }
    async syncSkills(sandbox: string, options: { force: boolean }) {
        this.syncCalls.push({ sandbox, force: options.force });
        this.activeSyncs += 1;
        this.maxConcurrentSyncs = Math.max(
            this.maxConcurrentSyncs,
            this.activeSyncs
        );
        try {
            const implementation = this.syncImplementations.shift();
            if (implementation) return await implementation();
            return JSON.stringify({
                status: "success",
                counts: counts({ unchanged: 2 })
            });
        } finally {
            this.activeSyncs -= 1;
        }
    }
}

function config(overrides: Partial<ManagerConfig> = {}): ManagerConfig {
    return ({
        hardDeleteSeconds: 100,
        idleSuspendSeconds: 50,
        skillSyncRetryWaitMs: 5_000,
        ...overrides
    } as unknown) as ManagerConfig;
}

function manager(
    kubernetes: FakeKubernetes,
    overrides: Partial<ManagerConfig> = {}
) {
    return new AgentManager(
        config(overrides),
        kubernetes as never,
        {} as never,
        {} as never
    );
}

function blocked() {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { gate, release };
}

async function waitFor(predicate: () => boolean) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (predicate()) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error("Timed out waiting for retry test condition");
}

async function expectRequestError(
    promise: Promise<unknown>,
    code: string
): Promise<void> {
    let caught: unknown;
    try {
        await promise;
    } catch (error) {
        caught = error;
    }
    expect(caught).to.be.instanceOf(WorkspaceRequestError);
    expect((caught as WorkspaceRequestError).code).to.equal(code);
    expect((caught as WorkspaceRequestError).status).to.equal(409);
}

describe("Workspace skill sync Retry / Re-check", () => {
    it("runs one forced sync in the caller's own Sandbox and records success", async () => {
        const kubernetes = new FakeKubernetes();
        const result = await manager(kubernetes).retrySkillSync(userId);

        expect(kubernetes.syncCalls).to.deep.equal([
            { sandbox: "sandbox-1", force: true }
        ]);
        expect(result).to.deep.include({
            completed: true,
            deduplicated: false
        });
        expect(result.skillSync).to.deep.include({
            status: "success",
            counts: counts({ unchanged: 2 })
        });
        expect(result.skillSync.diagnosticCode).to.equal(undefined);
        expect(result.skillSync.inProgress).to.equal(undefined);
        expect(
            kubernetes.claim!.metadata.annotations![STATE_ANNOTATION]
        ).to.equal("READY");
    });

    it("records partial results with sanitized per-skill problems", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.syncImplementations.push(async () =>
            JSON.stringify({
                status: "partial",
                counts: counts({ installed: 1, skipped: 1, failed: 1 }),
                problems: [
                    {
                        name: "edited-skill",
                        action: "skipped",
                        code: "LOCAL_CHANGES",
                        path: "/data/home/secret"
                    },
                    { name: "../../etc", action: "failed", code: "X" },
                    { name: "ok-name", action: "failed", code: "not a code" },
                    { name: "dl", action: "removed", code: "DOWNLOAD_FAILED" },
                    {
                        name: "system-x",
                        action: "failed",
                        code: "OPERATION_FAILED"
                    }
                ]
            })
        );
        const result = await manager(kubernetes).retrySkillSync(userId);

        expect(result.skillSync.status).to.equal("partial");
        expect(result.skillSync.problems).to.deep.equal([
            { name: "edited-skill", action: "skipped", code: "LOCAL_CHANGES" },
            { name: "system-x", action: "failed", code: "OPERATION_FAILED" }
        ]);
        expect(
            kubernetes.claim!.metadata.annotations![
                SKILL_SYNC_PROBLEMS_ANNOTATION
            ]
        ).to.not.include("/data/");
    });

    it("reports a remote-source failure without blaming local files", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.syncImplementations.push(async () =>
            JSON.stringify({
                status: "failed",
                counts: counts({ failed: 1 }),
                remoteSourceFailed: true,
                problems: [
                    {
                        name: "manifest",
                        action: "failed",
                        code: "DOWNLOAD_FAILED"
                    }
                ]
            })
        );
        const result = await manager(kubernetes).retrySkillSync(userId);
        expect(result.skillSync).to.deep.include({
            status: "failed",
            diagnosticCode: "REMOTE_SOURCE_FAILED"
        });
        expect(
            kubernetes.claim!.metadata.annotations![STATE_ANNOTATION]
        ).to.equal("READY");
    });

    it("records exec and invalid-output failures as failed without affecting READY", async () => {
        for (const [implementation, code] of [
            [
                async () => {
                    throw new Error("exec failed: pod gone");
                },
                "EXEC_FAILED"
            ],
            [async () => "not json", "INVALID_RESULT"],
            [
                async () =>
                    JSON.stringify({
                        status: "success",
                        counts: { installed: -1 }
                    }),
                "INVALID_RESULT"
            ]
        ] as const) {
            const kubernetes = new FakeKubernetes();
            kubernetes.syncImplementations.push(implementation);
            const result = await manager(kubernetes).retrySkillSync(userId);
            expect(result.skillSync).to.deep.include({
                status: "failed",
                diagnosticCode: code
            });
            expect(
                kubernetes.claim!.metadata.annotations![STATE_ANNOTATION]
            ).to.equal("READY");
        }
    });

    it("deduplicates concurrent Retry requests into one forced attempt", async () => {
        const kubernetes = new FakeKubernetes();
        const { gate, release } = blocked();
        kubernetes.syncImplementations.push(async () => {
            await gate;
            return JSON.stringify({ status: "success", counts: counts() });
        });
        const instance = manager(kubernetes);
        const first = instance.retrySkillSync(userId);
        await waitFor(() => kubernetes.syncCalls.length === 1);
        const second = instance.retrySkillSync(userId);
        release();
        const results = await Promise.all([first, second]);

        expect(kubernetes.syncCalls).to.have.lengthOf(1);
        expect(results.map((result) => result.deduplicated)).to.deep.equal([
            false,
            true
        ]);
        expect(results.every((result) => result.completed)).to.equal(true);
    });

    it("serializes a forced Retry after a running non-forced recovery sync", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claim!.metadata.annotations![SKILL_SYNC_STATUS_ANNOTATION] =
            "notAttempted";
        const { gate, release } = blocked();
        kubernetes.syncImplementations.push(async () => {
            await gate;
            return JSON.stringify({ status: "partial", counts: counts() });
        });
        const instance = manager(kubernetes);
        await instance.reconcileIdleWorkspaces().catch(() => undefined);
        await waitFor(() => kubernetes.syncCalls.length === 1);

        const retry = instance.retrySkillSync(userId);
        await new Promise((resolve) => setImmediate(resolve));
        expect(kubernetes.syncCalls).to.have.lengthOf(1);
        release();
        const result = await retry;

        expect(kubernetes.syncCalls.map((call) => call.force)).to.deep.equal([
            false,
            true
        ]);
        expect(kubernetes.maxConcurrentSyncs).to.equal(1);
        expect(result.deduplicated).to.equal(false);
        expect(result.skillSync.status).to.equal("success");
    });

    it("answers 202-style while still running and keeps GET status read-only", async () => {
        const kubernetes = new FakeKubernetes();
        const { gate, release } = blocked();
        kubernetes.syncImplementations.push(async () => {
            await gate;
            return JSON.stringify({ status: "success", counts: counts() });
        });
        const instance = manager(kubernetes, { skillSyncRetryWaitMs: 1 });
        const result = await instance.retrySkillSync(userId);
        expect(result.completed).to.equal(false);
        expect(result.skillSync.inProgress).to.equal(true);

        const status = await instance.status(userId);
        expect(status.skillSync?.inProgress).to.equal(true);
        await instance.status(userId);
        expect(kubernetes.syncCalls).to.have.lengthOf(1);

        release();
        await waitFor(
            () =>
                kubernetes.claim!.metadata.annotations![
                    SKILL_SYNC_STATUS_ANNOTATION
                ] === "success"
        );
        await waitFor(() => kubernetes.activeSyncs === 0);
        await new Promise((resolve) => setImmediate(resolve));
        expect((await instance.status(userId)).skillSync).to.deep.include({
            status: "success"
        });
        expect((await instance.status(userId)).skillSync?.inProgress).to.equal(
            undefined
        );
        expect(kubernetes.syncCalls).to.have.lengthOf(1);
    });

    it("never writes a stale result after reset/replacement during Retry", async () => {
        const kubernetes = new FakeKubernetes();
        const { gate, release } = blocked();
        kubernetes.syncImplementations.push(async () => {
            await gate;
            return JSON.stringify({
                status: "success",
                counts: counts({ installed: 99 })
            });
        });
        const retry = manager(kubernetes).retrySkillSync(userId);
        await waitFor(() => kubernetes.syncCalls.length === 1);
        // Reset replaced the claim: a new UID with its own (pending) status.
        kubernetes.claim = readyClaim("claim-2");
        kubernetes.claim.metadata.annotations![SKILL_SYNC_STATUS_ANNOTATION] =
            "notAttempted";
        release();

        await expectRequestError(retry, "WORKSPACE_CHANGED");
        expect(kubernetes.rejectedPatches).to.be.greaterThan(0);
        expect(
            kubernetes.claim.metadata.annotations![SKILL_SYNC_STATUS_ANNOTATION]
        ).to.equal("notAttempted");
    });

    it("reports a reset that starts deleting the same claim during Retry", async () => {
        const kubernetes = new FakeKubernetes();
        const { gate, release } = blocked();
        kubernetes.syncImplementations.push(async () => {
            await gate;
            return JSON.stringify({ status: "success", counts: counts() });
        });
        const retry = manager(kubernetes).retrySkillSync(userId);
        await waitFor(() => kubernetes.syncCalls.length === 1);
        kubernetes.claim!.metadata.annotations![STATE_ANNOTATION] = "DELETING";
        release();

        await expectRequestError(retry, "WORKSPACE_CHANGED");
        expect(
            kubernetes.claim!.metadata.annotations![
                SKILL_SYNC_STATUS_ANNOTATION
            ]
        ).to.equal("notAttempted");
    });

    it("rejects Retry when the Workspace is absent, not READY, deleting or busy", async () => {
        const absent = new FakeKubernetes();
        absent.claim = undefined;
        await expectRequestError(
            manager(absent).retrySkillSync(userId),
            "WORKSPACE_NOT_READY"
        );

        const suspended = new FakeKubernetes();
        suspended.claim!.metadata.annotations![STATE_ANNOTATION] = "SUSPENDED";
        await expectRequestError(
            manager(suspended).retrySkillSync(userId),
            "WORKSPACE_NOT_READY"
        );

        const deleting = new FakeKubernetes();
        deleting.claim!.metadata.deletionTimestamp = new Date().toISOString();
        await expectRequestError(
            manager(deleting).retrySkillSync(userId),
            "WORKSPACE_NOT_READY"
        );

        const foreign = new FakeKubernetes();
        foreign.claim = readyClaim("claim-1", otherUserId);
        await expectRequestError(
            manager(foreign).retrySkillSync(userId),
            "WORKSPACE_NOT_READY"
        );

        const busy = new FakeKubernetes();
        const instance = manager(busy);
        ((instance as unknown) as {
            operations: Map<string, unknown>;
        }).operations.set(userId, {
            promise: new Promise(() => undefined),
            state: "DELETING"
        });
        await expectRequestError(
            instance.retrySkillSync(userId),
            "WORKSPACE_BUSY"
        );

        for (const kubernetes of [absent, suspended, deleting, foreign, busy]) {
            expect(kubernetes.syncCalls).to.deep.equal([]);
        }
    });
});

describe("Workspace skill sync summary validation", () => {
    it("bounds the stored problem list", () => {
        const problems = Array.from(
            { length: SKILL_SYNC_MAX_PROBLEMS + 3 },
            (_, index) => ({
                name: `skill-${index}`,
                action: "failed",
                code: "DOWNLOAD_FAILED"
            })
        );
        const summary = parseSkillSyncSummary(
            JSON.stringify({ status: "failed", counts: counts(), problems })
        );
        expect(summary.problems).to.have.lengthOf(SKILL_SYNC_MAX_PROBLEMS);
        expect(summary.problemsTruncated).to.equal(true);
    });

    it("drops unexpected count fields", () => {
        const summary = parseSkillSyncSummary(
            JSON.stringify({
                status: "success",
                counts: { ...counts(), secret: "value" }
            })
        );
        expect(summary.counts).to.deep.equal(counts());
    });
});
