/** @jest-environment node */

import {
    AgentSkillApiError,
    listAgentSkills,
    replaceAgentSkillArchive,
    sharingErrorMessage
} from "./AgentSkillApis";
import { retryAgentWorkspaceSkillSync } from "./AgentWorkspaceApis";

jest.mock("../config", () => ({
    config: {
        baseUrl: "/",
        commonFetchRequestOptions: { credentials: "same-origin" }
    }
}));

function response(status: number, body?: unknown): Response {
    return ({
        ok: status >= 200 && status < 300,
        status,
        json: jest.fn().mockResolvedValue(body)
    } as unknown) as Response;
}

const skill = {
    id: "agent-skill-u-csv-clean",
    name: "csv-clean",
    description: "",
    type: "user" as const,
    userId: "u",
    ownerId: "u",
    createdAt: "",
    createdBy: "u",
    updatedAt: "",
    updatedBy: "u",
    checksum: "c".repeat(64)
};

describe("Agent Skill and Workspace sync API clients", () => {
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

    it("lists one server-filtered catalogue page", async () => {
        (global.fetch as jest.Mock).mockResolvedValue(
            response(200, { items: [skill], hasMore: false })
        );
        await listAgentSkills("mine", { pageToken: "7" });
        expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
            "/api/v0/agent/skills?type=user&userId=current&limit=10&pageToken=7"
        );
    });

    it("replaces with If-Match and a ZIP body through the authenticated API", async () => {
        (global.fetch as jest.Mock).mockResolvedValue(response(200, skill));
        const archive = { size: 3 } as Blob;
        await replaceAgentSkillArchive(skill, archive);
        const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(url).toBe(
            "/api/v0/agent/skills/user/agent-skill-u-csv-clean/archive"
        );
        expect(init.method).toBe("PUT");
        expect(init.body).toBe(archive);
        expect(init.credentials).toBe("same-origin");
        expect(init.headers.values).toMatchObject({
            "Content-Type": "application/zip",
            "If-Match": `"${"c".repeat(64)}"`
        });
    });

    it("surfaces the backend error code and network failures", async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce(
            response(409, {
                error: {
                    code: "AGENT_SKILL_NAME_IMMUTABLE",
                    message: "name differs"
                }
            })
        );
        await expect(
            replaceAgentSkillArchive(skill, {} as Blob)
        ).rejects.toMatchObject({
            status: 409,
            code: "AGENT_SKILL_NAME_IMMUTABLE"
        });
        (global.fetch as jest.Mock).mockRejectedValueOnce(
            new TypeError("offline")
        );
        const error = await replaceAgentSkillArchive(skill, {} as Blob).catch(
            (caught) => caught
        );
        expect(error).toBeInstanceOf(AgentSkillApiError);
        expect(error.code).toBe("NETWORK_ERROR");
    });

    it("posts Retry with no body and returns the Manager result", async () => {
        (global.fetch as jest.Mock).mockResolvedValue(
            response(200, {
                completed: true,
                deduplicated: false,
                skillSync: { status: "success" }
            })
        );
        const result = await retryAgentWorkspaceSkillSync();
        const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(url).toBe("/api/v0/agent/session/skill-sync/retry");
        expect(init.method).toBe("POST");
        expect(init.body).toBeUndefined();
        expect(result.skillSync.status).toBe("success");
    });

    it("reports Retry failures with the server message", async () => {
        (global.fetch as jest.Mock).mockResolvedValue(
            response(409, { message: "Agent Workspace must be ready" })
        );
        await expect(retryAgentWorkspaceSkillSync()).rejects.toMatchObject({
            status: 409,
            message: "Agent Workspace must be ready"
        });
    });

    it("explains the recipient limit", () => {
        expect(
            sharingErrorMessage(
                new AgentSkillApiError(
                    "limit",
                    409,
                    "AGENT_SKILL_SHARE_LIMIT_REACHED",
                    { limit: 500 }
                )
            )
        ).toBe(
            "This skill is already shared with the maximum of 500 users. Remove a recipient before adding another."
        );
    });
});
