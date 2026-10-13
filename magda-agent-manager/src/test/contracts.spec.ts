import { expect } from "chai";
import {
    claimName,
    INSTALLATION_LABEL,
    shutdownTimeForActivity,
    USER_LABEL
} from "../kubernetes.js";
import {
    isMeaningfulRuntimeRequest,
    RuntimeProxy,
    upstreamHeaders
} from "../runtimeProxy.js";
import { ManagerConfig, resolveLlmModel } from "../types.js";

function proxyConfig(): ManagerConfig {
    return {
        port: 8080,
        jwtSecret: "secret",
        namespace: "magda-agent",
        installationId: "a1b2c3d4e5f6",
        warmPool: "pool",
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
        systemUserId: "system",
        managedApiKeyName: "agent-key",
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
        llmContextWindow: 1_050_000,
        llmMaxTokens: 128_000,
        hardDeleteSeconds: 8 * 60 * 60,
        idleSuspendSeconds: 30 * 60,
        reconcileIntervalSeconds: 30,
        runtimeMaxBodyBytes: 1024,
        controlPlaneSecret: "control"
    };
}

describe("Agent Manager contracts", () => {
    it("defaults DSH to the stable MAGDA model alias", () => {
        expect(resolveLlmModel(undefined)).to.equal("magda-agent-default");
        expect(resolveLlmModel("private-model")).to.equal("private-model");
    });

    it("uses the accepted deterministic claim identity", () => {
        expect(
            claimName("00000000-0000-4000-8000-000000000123", "a1b2c3d4e5f6")
        ).to.equal(
            "magda-agent-a1b2c3d4e5f6-00000000-0000-4000-8000-000000000123"
        );
        expect(USER_LABEL).to.equal("agent.magda.io/user-id");
        expect(INSTALLATION_LABEL).to.equal("agent.magda.io/installation-id");
    });

    it("renews the hard-delete deadline from meaningful activity", () => {
        expect(
            shutdownTimeForActivity(
                new Date("2026-10-10T12:00:00.000Z"),
                8 * 60 * 60
            )
        ).to.equal("2026-10-10T20:00:00.000Z");
    });

    it("counts only explicit DSH user mutations as meaningful activity", () => {
        for (const path of [
            "/api/session/prompt",
            "/api/session/create",
            "/api/session/rename?source=user",
            "/api/terminal/write",
            "/api/subagents/prompt",
            "/api/$events/result"
        ]) {
            expect(isMeaningfulRuntimeRequest("POST", path)).to.equal(true);
        }
        for (const path of [
            "/api/session/list",
            "/api/session/follow",
            "/api/dynamicCordisRunner/inventory",
            "/api/schedule/catalog",
            "/api/remote.mux",
            "/status"
        ]) {
            expect(isMeaningfulRuntimeRequest("POST", path)).to.equal(false);
        }
        for (const method of ["GET", "HEAD", "OPTIONS", undefined]) {
            expect(
                isMeaningfulRuntimeRequest(method, "/api/session/prompt")
            ).to.equal(false);
        }
    });

    it("rate-limits activity only after persistence succeeds", async () => {
        let attempts = 0;
        const originalError = console.error;
        console.error = () => undefined;
        const proxy = new RuntimeProxy(proxyConfig(), {} as never, async () => {
            attempts += 1;
            if (attempts === 1) throw new Error("transient failure");
        });
        const touchActivity = ((proxy as unknown) as {
            touchActivity(userId: string): Promise<void>;
        }).touchActivity.bind(proxy);
        const originalNow = Date.now;
        Date.now = () => new Date("2026-10-10T12:00:00.000Z").getTime();
        try {
            await touchActivity("user-1").catch(() => undefined);
            await touchActivity("user-1");
            await touchActivity("user-1");
        } finally {
            Date.now = originalNow;
            console.error = originalError;
        }

        expect(attempts).to.equal(2);
    });

    it("coalesces concurrent writes without dropping newer activity", async () => {
        const persisted: Date[] = [];
        let complete!: () => void;
        const pending = new Promise<void>((resolve) => {
            complete = resolve;
        });
        let now = new Date("2026-10-10T12:00:00.000Z").getTime();
        const proxy = new RuntimeProxy(
            proxyConfig(),
            {} as never,
            async (_userId, activityTime) => {
                persisted.push(activityTime);
                if (persisted.length === 1) await pending;
            }
        );
        const touchActivity = ((proxy as unknown) as {
            touchActivity(userId: string): Promise<void>;
        }).touchActivity.bind(proxy);
        const originalNow = Date.now;
        Date.now = () => now;
        try {
            const first = touchActivity("user-1");
            now += 10_000;
            const second = touchActivity("user-1");
            expect(persisted).to.have.length(1);
            complete();
            await Promise.all([first, second]);
        } finally {
            Date.now = originalNow;
        }
        expect(persisted.map((at) => at.toISOString())).to.deep.equal([
            "2026-10-10T12:00:00.000Z",
            "2026-10-10T12:00:10.000Z"
        ]);
    });

    it("terminates browser and Magda credentials at the proxy boundary", () => {
        const headers = upstreamHeaders(
            {
                host: "agent-manager",
                origin: "https://magda.example",
                "sec-fetch-site": "same-origin",
                cookie: "connect.sid=browser; dsh=leak",
                authorization: "Bearer browser-secret",
                "proxy-authorization": "Basic secret",
                "x-magda-session": "jwt",
                "x-magda-api-key": "secret",
                "x-magda-api-key-id": "id",
                upgrade: "websocket",
                connection: "Upgrade"
            },
            "magda.example",
            "dsh-session=managed"
        );
        expect(headers.host).to.equal("magda.example");
        expect(headers.cookie).to.equal("dsh-session=managed");
        expect(headers.origin).to.equal("https://magda.example");
        expect(headers["sec-fetch-site"]).to.equal("same-origin");
        expect(headers.upgrade).to.equal("websocket");
        expect(headers.authorization).to.equal(undefined);
        expect(headers["proxy-authorization"]).to.equal(undefined);
        expect(headers["x-magda-session"]).to.equal(undefined);
        expect(headers["x-magda-api-key"]).to.equal(undefined);
        expect(headers["x-magda-api-key-id"]).to.equal(undefined);
    });
});
