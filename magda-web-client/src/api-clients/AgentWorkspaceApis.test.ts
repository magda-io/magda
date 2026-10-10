/** @jest-environment node */

jest.mock("../config", () => ({
    config: {
        baseUrl: "/",
        commonFetchRequestOptions: { credentials: "same-origin" }
    }
}));

import {
    AgentWorkspaceApiError,
    getAgentWorkspaceStatus,
    isAgentWorkspacePollingState,
    resetAgentWorkspace,
    resumeAgentWorkspace,
    startAgentWorkspace
} from "./AgentWorkspaceApis";

function response(status: number, body?: unknown): Response {
    return ({
        ok: status >= 200 && status < 300,
        status,
        json: jest.fn().mockResolvedValue(body)
    } as unknown) as Response;
}

describe("AgentWorkspaceApis", () => {
    const originalFetch = global.fetch;
    const originalHeaders = global.Headers;

    beforeAll(() => {
        global.Headers = (class TestHeaders {
            values: Record<string, string> = {};
            set(name: string, value: string) {
                this.values[name] = value;
            }
        } as unknown) as typeof Headers;
    });

    beforeEach(() => {
        global.fetch = jest.fn();
    });

    afterAll(() => {
        global.fetch = originalFetch;
        global.Headers = originalHeaders;
    });

    it("uses the lifecycle contract endpoints", async () => {
        (global.fetch as jest.Mock).mockResolvedValue(
            response(202, { state: "ALLOCATING" })
        );

        await startAgentWorkspace();
        await resumeAgentWorkspace();
        await resetAgentWorkspace();

        expect(global.fetch).toHaveBeenNthCalledWith(
            1,
            expect.stringMatching(/\/api\/v0\/agent\/session$/),
            expect.objectContaining({ method: "POST", cache: "no-store" })
        );
        expect(global.fetch).toHaveBeenNthCalledWith(
            2,
            expect.stringMatching(/\/api\/v0\/agent\/session\/resume$/),
            expect.objectContaining({ method: "POST" })
        );
        expect(global.fetch).toHaveBeenNthCalledWith(
            3,
            expect.stringMatching(/\/api\/v0\/agent\/session\/reset$/),
            expect.objectContaining({ method: "POST" })
        );
    });

    it("accepts every contract field from a status response", async () => {
        const expected = {
            state: "SUSPENDED" as const,
            message: "Idle workspace",
            retryable: true,
            updatedAt: "2026-10-10T00:00:00Z"
        };
        (global.fetch as jest.Mock).mockResolvedValue(response(200, expected));

        await expect(getAgentWorkspaceStatus()).resolves.toEqual(expected);
    });

    it("surfaces a server error message and status", async () => {
        (global.fetch as jest.Mock).mockResolvedValue(
            response(503, { message: "No sandbox capacity is available" })
        );

        await expect(getAgentWorkspaceStatus()).rejects.toMatchObject({
            name: "AgentWorkspaceApiError",
            message: "No sandbox capacity is available",
            status: 503
        } as Partial<AgentWorkspaceApiError>);
    });

    it("rejects unknown lifecycle states", async () => {
        (global.fetch as jest.Mock).mockResolvedValue(
            response(200, { state: "RUNNING" })
        );

        await expect(getAgentWorkspaceStatus()).rejects.toThrow(
            "unknown lifecycle state"
        );
    });
});

describe("isAgentWorkspacePollingState", () => {
    it.each([
        "ALLOCATING",
        "BOOTSTRAPPING",
        "SUSPENDING",
        "RESUMING",
        "DELETING"
    ] as const)("polls while %s", (state) => {
        expect(isAgentWorkspacePollingState(state)).toBe(true);
    });

    it.each(["ABSENT", "READY", "SUSPENDED", "FAILED", "DEGRADED"] as const)(
        "does not poll while %s",
        (state) => {
            expect(isAgentWorkspacePollingState(state)).toBe(false);
        }
    );
});
