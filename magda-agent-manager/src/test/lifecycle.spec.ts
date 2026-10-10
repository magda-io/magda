import { expect } from "chai";
import { AgentManager } from "../manager.js";
import {
    KEY_ID_ANNOTATION,
    LAST_ACTIVITY_ANNOTATION,
    STATE_ANNOTATION,
    USER_LABEL
} from "../kubernetes.js";
import { ManagerConfig, SandboxClaim, WorkspaceStatus } from "../types.js";

const userId = "00000000-0000-4000-8000-000000000123";

function config(): ManagerConfig {
    return {
        port: 8080,
        jwtSecret: "secret",
        namespace: "magda-dev-agents",
        installationId: "a1b2c3d4e5f6",
        warmPool: "magda-agent-a1b2c3d4e5f6-runc",
        authApiUrl: "http://authorization-api/v0",
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
        llmProvider: "magda",
        llmModel: "model",
        hardDeleteSeconds: 8 * 60 * 60,
        idleSuspendSeconds: 30 * 60,
        reconcileIntervalSeconds: 30,
        runtimeMaxBodyBytes: 1024,
        controlPlaneSecret: "control"
    };
}

function claim(lastActivity: Date, state = "READY"): SandboxClaim {
    return {
        apiVersion: "extensions.agents.x-k8s.io/v1beta1",
        kind: "SandboxClaim",
        metadata: {
            name: "claim",
            creationTimestamp: lastActivity.toISOString(),
            labels: { [USER_LABEL]: userId },
            annotations: {
                [STATE_ANNOTATION]: state,
                [LAST_ACTIVITY_ANNOTATION]: lastActivity.toISOString(),
                [KEY_ID_ANNOTATION]: "key-1"
            }
        },
        status: { sandbox: { name: "sandbox-1" } }
    };
}

class FakeKubernetes {
    claims: SandboxClaim[] = [];
    modes: string[] = [];
    activity: Array<{ userId: string; at: Date }> = [];
    deleted = 0;

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
        const current = this.claims[0];
        if (!current.metadata.annotations) current.metadata.annotations = {};
        for (const [name, value] of Object.entries(annotations)) {
            if (value === null) delete current.metadata.annotations[name];
            else current.metadata.annotations[name] = value;
        }
        return current;
    }
    async updateActivity(id: string, at: Date) {
        this.activity.push({ userId: id, at });
        if (this.claims[0]) {
            this.claims[0].metadata.annotations![
                LAST_ACTIVITY_ANNOTATION
            ] = at.toISOString();
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
    async waitForPodReady() {}
    async deleteClaim() {
        this.deleted += 1;
        this.claims = [];
    }
}

class FakeApiKeys {
    extended: Date[] = [];
    deleted = 0;
    deleteError: Error | undefined;
    async extend(_userId: string, _keyId: string, expiry: Date) {
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

function manager(kubernetes: FakeKubernetes, keys = new FakeApiKeys()) {
    return {
        manager: new AgentManager(
            config(),
            kubernetes as never,
            keys as never,
            new FakeProxy() as never
        ),
        keys
    };
}

describe("Agent Workspace inactivity lifecycle", () => {
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

    it("renews both the claim deadline and managed credential", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [claim(new Date(Date.now() - 9 * 60 * 60 * 1000))];
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

    it("retries interrupted cleanup without losing key identity", async () => {
        const kubernetes = new FakeKubernetes();
        kubernetes.claims = [claim(new Date(), "BOOTSTRAPPING")];
        const keys = new FakeApiKeys();
        keys.deleteError = new Error("authorization API unavailable");

        await manager(kubernetes, keys).manager.reconcileIdleWorkspaces();

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
