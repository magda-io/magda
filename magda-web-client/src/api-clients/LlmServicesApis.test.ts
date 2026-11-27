import {
    attachAccessProfileRole,
    createAccessProfile,
    deleteAccessProfile,
    describeLlmServicesError,
    describeUsageError,
    detachAccessProfileRole,
    getMyDailyUsage,
    getMyUsage,
    getNoAccessHelp,
    getUserDailyUsage,
    getUserUsage,
    listInvocableModels,
    listUserUsage,
    getAccessProfile,
    getAvailableModels,
    isStaleRevisionError,
    listAccessProfileRoleCandidates,
    listAccessProfileRoles,
    listAccessProfiles,
    LlmServicesApiError,
    updateAccessProfile
} from "./LlmServicesApis";

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

const id = "3b1eceed-603e-4173-91ff-a3475c75b25b";
const roleId = "00000000-3838-4200-8000-0000000000aa";
const fields = {
    name: "Finance",
    description: null,
    allowedModels: ["*"],
    enabled: true,
    orgUnitId: null,
    constraintExemption: false,
    allowedDailyTokens: 1000,
    allowedWeeklyTokens: null,
    allowedMonthlyTokens: 0
};

describe("LlmServicesApis", () => {
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
        global.fetch = jest.fn().mockResolvedValue(response(200, {}));
    });

    afterAll(() => {
        global.fetch = originalFetch;
        global.Headers = originalHeaders;
    });

    const call = (index = 0) => {
        const [url, init] = (global.fetch as jest.Mock).mock.calls[index];
        return {
            url: new URL(url),
            method: init.method,
            headers: init.headers.values as Record<string, string>,
            body: init.body ? JSON.parse(init.body) : undefined,
            cache: init.cache,
            credentials: init.credentials
        };
    };

    it("calls the API-1 to API-6 endpoints through the Gateway", async () => {
        (global.fetch as jest.Mock).mockResolvedValue(
            response(200, { items: [], total: 0 })
        );
        await listAccessProfiles({ q: "  fin ", offset: 20, limit: 10 });
        await getAccessProfile(id);
        await listAccessProfileRoles(id, { offset: 0, limit: 500 });
        await listAccessProfileRoleCandidates(id, { q: "data" });
        await getAvailableModels();

        expect(
            (global.fetch as jest.Mock).mock.calls.map((_, index) => {
                const { url, method } = call(index);
                return `${method} ${url.pathname}${url.search}`;
            })
        ).toEqual([
            "GET /api/v0/llm/access-profiles?q=fin&offset=20&limit=10",
            `GET /api/v0/llm/access-profiles/${id}`,
            `GET /api/v0/llm/access-profiles/${id}/roles?offset=0&limit=500`,
            `GET /api/v0/llm/access-profiles/${id}/role-candidates?q=data&limit=20`,
            "GET /api/v0/llm/available-models"
        ]);
        // user-specific responses are never cached
        expect(call().cache).toBe("no-store");
        expect(call().credentials).toBe("same-origin");
    });

    it("omits an empty search", async () => {
        (global.fetch as jest.Mock).mockResolvedValue(
            response(200, { items: [], total: 0 })
        );
        await listAccessProfiles({ q: "   " });
        expect(call().url.searchParams.has("q")).toBe(false);
    });

    it("creates, updates with If-Match, and deletes", async () => {
        await createAccessProfile(fields);
        await updateAccessProfile(id, 7, fields);
        (global.fetch as jest.Mock).mockResolvedValue(response(204));
        await deleteAccessProfile(id);

        expect(call(0).method).toBe("POST");
        expect(call(0).body).toEqual(fields);
        expect(call(0).headers["Content-Type"]).toBe("application/json");
        expect(call(1).method).toBe("PUT");
        expect(call(1).url.pathname).toBe(`/api/v0/llm/access-profiles/${id}`);
        expect(call(1).headers["If-Match"]).toBe('"7"');
        expect(call(1).body).toEqual(fields);
        expect(call(2).method).toBe("DELETE");
    });

    it("attaches and detaches a role", async () => {
        (global.fetch as jest.Mock).mockResolvedValue(response(204));
        await attachAccessProfileRole(id, roleId);
        await detachAccessProfileRole(id, roleId);
        expect([call(0).method, call(0).url.pathname]).toEqual([
            "PUT",
            `/api/v0/llm/access-profiles/${id}/roles/${roleId}`
        ]);
        expect([call(1).method, call(1).url.pathname]).toEqual([
            "DELETE",
            `/api/v0/llm/access-profiles/${id}/roles/${roleId}`
        ]);
    });

    it("parses a stale revision error", async () => {
        (global.fetch as jest.Mock).mockResolvedValue(
            response(409, {
                error: {
                    message: "The profile was changed by someone else",
                    code: "llm_profile_stale_revision",
                    currentRevision: 8
                }
            })
        );
        const error = await updateAccessProfile(id, 7, fields).catch((e) => e);
        expect(error).toBeInstanceOf(LlmServicesApiError);
        expect(error.status).toBe(409);
        expect(error.code).toBe("llm_profile_stale_revision");
        expect(error.currentRevision).toBe(8);
        expect(isStaleRevisionError(error)).toBe(true);
        expect(describeLlmServicesError(error)).toBe(
            "This profile was changed by someone else. Reload to see the changes."
        );
    });

    it("keeps a status when the error body isn't JSON", async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 503,
            json: jest.fn().mockRejectedValue(new Error("not json"))
        });
        const error = await deleteAccessProfile(id).catch((e) => e);
        expect(error.status).toBe(503);
        expect(isStaleRevisionError(error)).toBe(false);
        expect(describeLlmServicesError(error)).toMatch(
            /unavailable\. Retry shortly\.$/
        );
    });

    it("describes each state with actionable text", () => {
        const text = (status: number, message = "bad") =>
            describeLlmServicesError(new LlmServicesApiError(message, status));
        expect(text(403)).toMatch(/permission/);
        expect(text(404)).toMatch(/no longer exists/);
        expect(text(422, "orgUnitId doesn't exist")).toBe(
            "The change was rejected: orgUnitId doesn't exist"
        );
        expect(text(429)).toMatch(/Wait a moment/);
        expect(text(502)).toMatch(/refused the change/);
        expect(describeLlmServicesError(new TypeError("offline"))).toMatch(
            /Unable to reach LLM Services/
        );
    });

    it("calls the usage endpoints (API-7, API-8) and never sends a user ID for My Usage", async () => {
        (global.fetch as jest.Mock).mockResolvedValue(
            response(200, { items: [], total: 0 })
        );
        await getMyUsage();
        await getMyDailyUsage({
            model: "magda-agent-default",
            from: "2026-11-01",
            to: "",
            offset: 10,
            limit: 10
        });
        await listUserUsage({ q: " una ", offset: 0, limit: 20 });
        await getUserUsage(id);
        await getUserDailyUsage(id, { from: "2026-11-01" });
        expect(
            (global.fetch as jest.Mock).mock.calls.map((_, index) => {
                const { url, method } = call(index);
                return `${method} ${url.pathname}${url.search}`;
            })
        ).toEqual([
            "GET /api/v0/llm/usage/me",
            "GET /api/v0/llm/usage/me/daily?model=magda-agent-default&from=2026-11-01&offset=10&limit=10",
            "GET /api/v0/llm/usage/users?q=una&offset=0&limit=20",
            `GET /api/v0/llm/usage/users/${id}`,
            `GET /api/v0/llm/usage/users/${id}/daily?from=2026-11-01`
        ]);
        expect(call().cache).toBe("no-store");
    });

    it("reads the invocable models and the no-access help", async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce(
            response(200, {
                object: "list",
                data: [{ id: "magda-agent-default" }, { id: 3 }]
            })
        );
        expect(await listInvocableModels()).toEqual(["magda-agent-default"]);
        expect(call().url.pathname).toBe("/api/v0/llm/v1/models");
        (global.fetch as jest.Mock).mockResolvedValueOnce(
            response(200, { noAccessHelp: { text: "Ask" } })
        );
        expect(await getNoAccessHelp()).toEqual({ text: "Ask" });
        expect(call(1).url.pathname).toBe("/api/v0/llm/access-help");
    });

    it("explains usage errors", () => {
        expect(
            describeUsageError(new LlmServicesApiError("denied", 403))
        ).toMatch(/permission to see other users/);
        expect(
            describeUsageError(
                new LlmServicesApiError("x", 503, "llm_usage_unavailable")
            )
        ).toMatch(/accounting is temporarily unavailable/);
        expect(
            describeUsageError(new LlmServicesApiError("bad date", 400))
        ).toMatch(/bad date/);
    });
});
