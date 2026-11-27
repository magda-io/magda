import assert from "node:assert/strict";
import fs from "node:fs";
import http, { RequestListener } from "node:http";
import { AddressInfo } from "node:net";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import pg from "pg";
import createApp, { LlmServicesConfig } from "../createApp.js";
import ServedModels from "../access/ServedModels.js";
import { addDays, periodsAt } from "../usage/periods.js";
import { parseNoAccessHelp } from "../usage/createUsageRouter.js";
import { createTestDatabase } from "./testDb.js";
import { ADMIN_ROLE, FakeAuthApi, startFakeAuthApi } from "./fakeAuthApi.js";

// #3838 #3949: the usage API (API-7, API-8, API-12, AUTH-9, USE-8, TEST-8).

const RECORDED = JSON.parse(
    fs.readFileSync(
        path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "fixtures/llmInvokeDecisions.json"
        ),
        "utf8"
    )
);

const jwtSecret = "llm-services-usage-api-secret";
const TIME_ZONE = "Australia/Sydney";
const USER = "00000000-0000-4000-8000-000000000123";
const OTHER_USER = "00000000-0000-4000-8000-000000000456";
const ADMIN = "00000000-0000-4000-8000-000000000789";
const VIEWER = "00000000-0000-4000-8000-0000000000ee";
const NO_ACCESS = "00000000-0000-4000-8000-0000000000dd";

const PROFILE_A = "00000000-0000-4000-8000-00000000000a";
const PROFILE_B = "00000000-0000-4000-8000-00000000000b";
const PROFILE_C = "00000000-0000-4000-8000-00000000000c";

function sessionOf(userId: string) {
    return jwt.sign({ userId }, jwtSecret, { algorithm: "HS256" });
}

async function listen(handler: RequestListener) {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    return { server, url: new URL(`http://127.0.0.1:${port}`) };
}

async function close(server: http.Server) {
    server.close();
    server.closeAllConnections();
    await once(server, "close");
}

describe("usage API (integration, #3838 #3949)", function (this: Mocha.Suite) {
    this.timeout(30000);
    let pool: pg.Pool;
    let drop: () => Promise<void>;
    let authApi: FakeAuthApi;
    const allowedModels = new Set(["shared-model", "second-model"]);
    const servedModels = new ServedModels({
        liteLlmUrl: new URL("http://127.0.0.1:1"),
        liteLlmKey: "unused"
    });
    const today = () => periodsAt(new Date(), TIME_ZONE);

    before(async () => {
        ({ pool, drop } = await createTestDatabase("usage_api"));
    });

    after(async () => {
        await drop?.();
    });

    beforeEach(async () => {
        await pool.query("TRUNCATE access_profiles, daily_model_usage");
        authApi = await startFakeAuthApi();
        authApi.users.set(ADMIN, {
            roles: [ADMIN_ROLE],
            operations: { "llm/usage/read": true }
        });
        authApi.users.set(USER, {
            roles: [],
            decision: RECORDED.decisions["unconstrained"],
            displayName: "Una User",
            email: "una@example.test"
        });
        authApi.users.set(OTHER_USER, {
            roles: [],
            decision: RECORDED.decisions["unconstrained"],
            displayName: "Otto Other",
            email: "otto@example.test"
        });
        authApi.users.set(NO_ACCESS, {
            roles: [],
            decision: RECORDED.decisions["no permission"],
            displayName: "Nora Noaccess"
        });
        authApi.users.set(VIEWER, {
            roles: [],
            decision: RECORDED.decisions["no permission"],
            operations: { "llm/usage/read": true }
        });
    });

    afterEach(async () => {
        await authApi.close();
    });

    let permissionCounter = 0;
    async function seed(profile: {
        id: string;
        allowedModels: string[];
        enabled?: boolean;
        daily?: number | null;
        weekly?: number | null;
        monthly?: number | null;
    }) {
        await pool.query(
            `INSERT INTO access_profiles
                (id, name, allowed_models, enabled, use_permission_id,
                 allowed_daily_tokens, allowed_weekly_tokens, allowed_monthly_tokens)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                profile.id,
                `Profile ${profile.id.slice(-4)}`,
                profile.allowedModels,
                profile.enabled ?? true,
                `00000000-0000-4000-9000-${String(++permissionCounter).padStart(
                    12,
                    "0"
                )}`,
                profile.daily ?? null,
                profile.weekly ?? null,
                profile.monthly ?? null
            ]
        );
    }

    async function useTokens(
        userId: string,
        alias: string,
        localDate: string,
        amounts: { input?: number; output?: number; estimated?: number }
    ) {
        await pool.query(
            `INSERT INTO daily_model_usage
                (user_id, model_alias, local_date, measured_input_tokens,
                 measured_output_tokens, estimated_tokens, estimated_requests)
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                userId,
                alias,
                localDate,
                amounts.input ?? 0,
                amounts.output ?? 0,
                amounts.estimated ?? 0,
                amounts.estimated ? 1 : 0
            ]
        );
    }

    async function withApp(
        run: (
            get: (path: string, userId?: string) => Promise<any>
        ) => Promise<void>,
        overrides: Partial<LlmServicesConfig> = {}
    ) {
        const app = await listen(
            createApp({
                jwtSecret,
                authApiUrl: authApi.url,
                liteLlmUrl: new URL("http://127.0.0.1:1"),
                liteLlmKey: "master-key",
                allowedModels,
                servedModels,
                pool,
                usageTimeZone: TIME_ZONE,
                decisionCacheSeconds: 0,
                ...overrides
            })
        );
        try {
            await run(async (path: string, userId?: string) => {
                const response = await fetch(new URL(path, app.url), {
                    headers: userId
                        ? { "X-Magda-Session": sessionOf(userId) }
                        : {}
                });
                const text = await response.text();
                return {
                    status: response.status,
                    headers: response.headers,
                    text,
                    body: text ? JSON.parse(text) : undefined
                };
            });
        } finally {
            await close(app.server);
        }
    }

    describe("My Usage (API-7)", () => {
        it("always reports the session's own user, whatever user ID is supplied (TEST-8)", async () => {
            await seed({ id: PROFILE_A, allowedModels: ["shared-model"] });
            const day = today().day;
            await useTokens(USER, "shared-model", day, { input: 10 });
            await useTokens(OTHER_USER, "shared-model", day, { input: 999 });
            await withApp(async (get) => {
                for (const path of [
                    "/v0/usage/me",
                    `/v0/usage/me?userId=${OTHER_USER}`,
                    `/v0/usage/me?user=${OTHER_USER}&userId[]=${OTHER_USER}`
                ]) {
                    const res = await get(path, USER);
                    assert.equal(res.status, 200, res.text);
                    assert.equal(res.body.user.id, USER);
                    assert.equal(res.body.totals.allTime.tokens, 10);
                    assert.ok(!res.text.includes(OTHER_USER));
                }
                for (const path of [
                    "/v0/usage/me/daily",
                    `/v0/usage/me/daily?userId=${OTHER_USER}`
                ]) {
                    const res = await get(path, USER);
                    assert.equal(res.status, 200, res.text);
                    assert.deepEqual(
                        res.body.items.map((row: any) => row.tokens),
                        [10]
                    );
                }
            });
        });

        it("answers 401 without a valid session, never cacheable", async () => {
            await withApp(async (get) => {
                for (const path of [
                    "/v0/usage/me",
                    "/v0/usage/me/daily",
                    "/v0/usage/users",
                    `/v0/usage/users/${USER}`,
                    "/v0/access-help"
                ]) {
                    const res = await get(path);
                    assert.equal(res.status, 401, path);
                    assert.equal(
                        res.headers.get("cache-control"),
                        "private, no-store"
                    );
                }
            });
        });

        it("sums all time, today, the ISO week and the month, measured and estimated separately (USE-4)", async () => {
            await seed({ id: PROFILE_A, allowedModels: ["*"] });
            const p = today();
            await useTokens(USER, "shared-model", p.day, {
                input: 100,
                output: 20,
                estimated: 5
            });
            await useTokens(USER, "second-model", p.day, { input: 1 });
            // before this month (and this week): all time only
            await useTokens(USER, "shared-model", addDays(p.monthStart, -1), {
                input: 1000
            });
            // before this week, maybe in this month
            const beforeWeek = addDays(p.weekStart, -1);
            if (beforeWeek !== addDays(p.monthStart, -1)) {
                await useTokens(USER, "second-model", beforeWeek, {
                    output: 7
                });
            }
            const monthHasBeforeWeek =
                beforeWeek >= p.monthStart &&
                beforeWeek !== addDays(p.monthStart, -1);
            await withApp(async (get) => {
                const res = await get("/v0/usage/me", USER);
                assert.equal(res.status, 200, res.text);
                const { totals, models, timeZone, periods } = res.body;
                assert.equal(timeZone, TIME_ZONE);
                assert.deepEqual(periods, p);
                assert.equal(totals.day.tokens, 126);
                assert.equal(totals.day.measuredInputTokens, 101);
                assert.equal(totals.day.measuredOutputTokens, 20);
                assert.equal(totals.day.estimatedTokens, 5);
                assert.equal(totals.day.estimatedRequests, 1);
                assert.equal(totals.week.tokens, 126);
                assert.equal(
                    totals.month.tokens,
                    126 + (monthHasBeforeWeek ? 7 : 0)
                );
                assert.equal(
                    totals.allTime.tokens,
                    1126 + (beforeWeek !== addDays(p.monthStart, -1) ? 7 : 0)
                );
                const shared = models.find(
                    (m: any) => m.modelAlias === "shared-model"
                );
                assert.equal(shared.usage.day.tokens, 125);
                assert.equal(shared.usage.allTime.tokens, 1125);
            });
        });

        it("reports zero usage as zeros, with the eligible models listed", async () => {
            await seed({ id: PROFILE_A, allowedModels: ["shared-model"] });
            await withApp(async (get) => {
                const res = await get("/v0/usage/me", USER);
                assert.equal(res.status, 200, res.text);
                assert.equal(res.body.access, "profiles");
                assert.equal(res.body.totals.allTime.tokens, 0);
                assert.deepEqual(
                    res.body.models.map((m: any) => [
                        m.modelAlias,
                        m.eligible,
                        m.remaining.status
                    ]),
                    [["shared-model", true, "unlimited"]]
                );
                assert.equal(res.body.noAccessHelp, null);
            });
        });
    });

    describe("remaining quota (USE-8)", () => {
        it("is the larger of two eligible profiles' minimum remaining, per alias", async () => {
            await seed({
                id: PROFILE_A,
                allowedModels: ["shared-model"],
                daily: 100,
                monthly: 1000
            });
            await seed({
                id: PROFILE_B,
                allowedModels: ["shared-model", "second-model"],
                weekly: 300
            });
            await useTokens(USER, "shared-model", today().day, { input: 60 });
            await withApp(async (get) => {
                const res = await get("/v0/usage/me", USER);
                assert.equal(res.status, 200, res.text);
                const byAlias = Object.fromEntries(
                    res.body.models.map((m: any) => [m.modelAlias, m])
                );
                // A: min(100 - 60, 1000 - 60) = 40; B: 300 - 60 = 240
                assert.deepEqual(byAlias["shared-model"].remaining, {
                    status: "limited",
                    remainingTokens: 240
                });
                // per period: B's, the profile that gives the 240
                assert.deepEqual(byAlias["shared-model"].periodRemaining, {
                    day: { status: "unlimited" },
                    week: { status: "limited", remainingTokens: 240 },
                    month: { status: "unlimited" }
                });
                // counters are per alias (MODEL-3)
                assert.deepEqual(byAlias["second-model"].remaining, {
                    status: "limited",
                    remainingTokens: 300
                });
                assert.deepEqual(byAlias["second-model"].periodRemaining, {
                    day: { status: "unlimited" },
                    week: { status: "limited", remainingTokens: 300 },
                    month: { status: "unlimited" }
                });
            });
        });

        it("shows Exhausted when every profile is used up, and Unlimited for a NULL-limit profile", async () => {
            await seed({
                id: PROFILE_A,
                allowedModels: ["shared-model", "second-model"],
                daily: 50
            });
            await seed({
                id: PROFILE_B,
                allowedModels: ["shared-model"],
                monthly: 0
            });
            await seed({
                id: PROFILE_C,
                allowedModels: ["second-model"]
            });
            await useTokens(USER, "shared-model", today().day, { input: 60 });
            await useTokens(USER, "second-model", today().day, { input: 60 });
            await withApp(async (get) => {
                const res = await get("/v0/usage/me", USER);
                const byAlias = Object.fromEntries(
                    res.body.models.map((m: any) => [m.modelAlias, m])
                );
                assert.deepEqual(byAlias["shared-model"].remaining, {
                    status: "exhausted",
                    remainingTokens: 0
                });
                assert.deepEqual(byAlias["second-model"].remaining, {
                    status: "unlimited"
                });
            });
        });

        it("resets with the period: last month's usage doesn't use up this month's limit", async () => {
            await seed({
                id: PROFILE_A,
                allowedModels: ["shared-model"],
                monthly: 100
            });
            const lastMonth = addDays(today().monthStart, -1);
            await useTokens(USER, "shared-model", lastMonth, { input: 500 });
            await withApp(async (get) => {
                const res = await get("/v0/usage/me", USER);
                assert.deepEqual(res.body.models[0].remaining, {
                    status: "limited",
                    remainingTokens: 100
                });
                assert.equal(res.body.models[0].usage.allTime.tokens, 500);
                assert.equal(res.body.models[0].usage.month.tokens, 0);
            });
        });

        it("reports No eligible model profile, not 0, with the configured help (UI case 6)", async () => {
            await seed({ id: PROFILE_A, allowedModels: ["shared-model"] });
            // usage from earlier access is still listed, as not eligible
            await useTokens(NO_ACCESS, "shared-model", today().day, {
                input: 3
            });
            const noAccessHelp = {
                text: "Request access from the service desk.",
                url: "https://help.example.test/llm"
            };
            await withApp(
                async (get) => {
                    const res = await get("/v0/usage/me", NO_ACCESS);
                    assert.equal(res.status, 200, res.text);
                    assert.equal(res.body.access, "none");
                    assert.deepEqual(res.body.noAccessHelp, noAccessHelp);
                    assert.deepEqual(res.body.models, [
                        {
                            modelAlias: "shared-model",
                            eligible: false,
                            remaining: { status: "no_eligible_profile" },
                            periodRemaining: {
                                day: { status: "no_eligible_profile" },
                                week: { status: "no_eligible_profile" },
                                month: { status: "no_eligible_profile" }
                            },
                            usage: res.body.models[0].usage
                        }
                    ]);
                    const help = await get("/v0/access-help", NO_ACCESS);
                    assert.deepEqual(help.body, { noAccessHelp });
                },
                { noAccessHelp }
            );
        });

        it("handles missing help configuration", async () => {
            await withApp(async (get) => {
                const res = await get("/v0/usage/me", NO_ACCESS);
                assert.equal(res.body.access, "none");
                assert.deepEqual(res.body.models, []);
                assert.equal(res.body.noAccessHelp, null);
                const help = await get("/v0/access-help", NO_ACCESS);
                assert.deepEqual(help.body, { noAccessHelp: null });
            });
        });

        it("shows administrators every allowed alias as Unlimited (AUTH-10)", async () => {
            await useTokens(ADMIN, "shared-model", today().day, { input: 9 });
            await withApp(async (get) => {
                const res = await get("/v0/usage/me", ADMIN);
                assert.equal(res.body.access, "administrator");
                assert.deepEqual(
                    res.body.models.map((m: any) => [
                        m.modelAlias,
                        m.remaining.status
                    ]),
                    [
                        ["shared-model", "unlimited"],
                        ["second-model", "unlimited"]
                    ]
                );
                assert.equal(res.body.totals.day.tokens, 9);
            });
        });
    });

    describe("daily history", () => {
        it("pages newest first, filters by model and an inclusive date range", async () => {
            const p = today();
            const days = [0, 1, 2, 3].map((n) => addDays(p.day, -n));
            for (const day of days) {
                await useTokens(USER, "shared-model", day, { input: 1 });
            }
            await useTokens(USER, "second-model", days[1], { estimated: 4 });
            await withApp(async (get) => {
                let res = await get("/v0/usage/me/daily?limit=2", USER);
                assert.equal(res.status, 200, res.text);
                assert.equal(res.body.total, 5);
                assert.equal(res.body.timeZone, TIME_ZONE);
                assert.deepEqual(
                    res.body.items.map((r: any) => r.localDate),
                    [days[0], days[1]]
                );
                res = await get(`/v0/usage/me/daily?model=second-model`, USER);
                assert.deepEqual(
                    res.body.items.map((r: any) => [
                        r.localDate,
                        r.estimatedTokens,
                        r.tokens
                    ]),
                    [[days[1], 4, 4]]
                );
                res = await get(
                    `/v0/usage/me/daily?model=shared-model&from=${days[2]}&to=${days[1]}`,
                    USER
                );
                assert.deepEqual(
                    res.body.items.map((r: any) => r.localDate),
                    [days[1], days[2]]
                );
                for (const bad of [
                    "from=yesterday",
                    "to=2026-02-30",
                    `from=${days[0]}&to=${days[3]}`
                ]) {
                    res = await get(`/v0/usage/me/daily?${bad}`, USER);
                    assert.equal(res.status, 400, bad);
                    assert.equal(res.body.error.code, "llm_usage_invalid");
                }
            });
        });
    });

    describe("User Usage (API-8, AUTH-9, API-12)", () => {
        it("is denied without llm/usage/read, even for the caller's own ID (TEST-8)", async () => {
            await withApp(async (get) => {
                for (const path of [
                    "/v0/usage/users",
                    `/v0/usage/users/${OTHER_USER}`,
                    `/v0/usage/users/${OTHER_USER}/daily`,
                    `/v0/usage/users/${USER}`
                ]) {
                    const res = await get(path, USER);
                    assert.equal(res.status, 403, path);
                    assert.equal(res.body.error.code, "llm_access_denied");
                    assert.equal(
                        res.headers.get("cache-control"),
                        "private, no-store"
                    );
                    assert.ok(!res.text.includes("otto"));
                }
            });
            // the decision is the caller's own
            assert.ok(
                authApi.calls.decisions.some(
                    (call) =>
                        call.userId === USER &&
                        call.path.startsWith("/v0/opa/decision/llm/usage/read")
                )
            );
        });

        it("answers 503 when the decision can't be made", async () => {
            authApi.users.get(VIEWER)!.operations = {
                "llm/usage/read": "unavailable"
            };
            await withApp(async (get) => {
                const res = await get(`/v0/usage/users/${USER}`, VIEWER);
                assert.equal(res.status, 503);
            });
        });

        it("reports another user's usage and remaining quota from that user's own grants", async () => {
            await seed({
                id: PROFILE_A,
                allowedModels: ["shared-model"],
                daily: 100
            });
            await useTokens(OTHER_USER, "shared-model", today().day, {
                input: 30
            });
            await withApp(async (get) => {
                const res = await get(`/v0/usage/users/${OTHER_USER}`, VIEWER);
                assert.equal(res.status, 200, res.text);
                // the viewer may not read users: ID only
                assert.deepEqual(res.body.user, { id: OTHER_USER });
                assert.equal(res.body.access, "profiles");
                assert.deepEqual(res.body.models[0].remaining, {
                    status: "limited",
                    remainingTokens: 70
                });
                const daily = await get(
                    `/v0/usage/users/${OTHER_USER}/daily`,
                    VIEWER
                );
                assert.deepEqual(
                    daily.body.items.map((r: any) => r.tokens),
                    [30]
                );
                // the viewer, who has no invoke grant, still sees the
                // target's eligibility
                const none = await get(`/v0/usage/users/${NO_ACCESS}`, VIEWER);
                assert.equal(none.body.access, "none");
                // an unknown user has no access, and no usage
                const unknown = await get(
                    "/v0/usage/users/00000000-0000-4000-8000-0000000000ff",
                    VIEWER
                );
                assert.equal(unknown.status, 200);
                assert.equal(unknown.body.access, "none");
                assert.equal(unknown.body.totals.allTime.tokens, 0);
                const bad = await get("/v0/usage/users/not-a-uuid", VIEWER);
                assert.equal(bad.status, 400);
            });
            assert.ok(
                authApi.calls.decisions.some(
                    (call) =>
                        call.userId === OTHER_USER &&
                        call.path.startsWith(
                            "/v0/opa/decision/llm/access/invoke"
                        )
                )
            );
        });

        it("lists users with usage, most tokens first, with names only for viewers who may read users", async () => {
            const day = today().day;
            await useTokens(USER, "shared-model", day, { input: 10 });
            await useTokens(OTHER_USER, "shared-model", day, { input: 50 });
            await useTokens(OTHER_USER, "second-model", day, { input: 5 });
            await withApp(async (get) => {
                let res = await get("/v0/usage/users", VIEWER);
                assert.equal(res.status, 200, res.text);
                assert.equal(res.body.total, 2);
                assert.deepEqual(
                    res.body.items.map((i: any) => [
                        i.userId,
                        i.tokens,
                        i.user
                    ]),
                    [
                        [OTHER_USER, 55, { id: OTHER_USER }],
                        [USER, 10, { id: USER }]
                    ]
                );
                res = await get("/v0/usage/users?model=second-model", VIEWER);
                assert.deepEqual(
                    res.body.items.map((i: any) => [i.userId, i.tokens]),
                    [[OTHER_USER, 5]]
                );
                // name search needs user read rights: nobody found
                res = await get("/v0/usage/users?q=otto", VIEWER);
                assert.deepEqual(res.body.items, []);
                // an ID always finds that user, even without usage
                res = await get(`/v0/usage/users?q=${NO_ACCESS}`, VIEWER);
                assert.deepEqual(
                    res.body.items.map((i: any) => [i.userId, i.tokens]),
                    [[NO_ACCESS, 0]]
                );

                authApi.users.get(VIEWER)!.canReadUsers = true;
                res = await get("/v0/usage/users?q=otto", VIEWER);
                assert.deepEqual(
                    res.body.items.map((i: any) => i.user),
                    [
                        {
                            id: OTHER_USER,
                            displayName: "Otto Other",
                            email: "otto@example.test"
                        }
                    ]
                );
                res = await get(`/v0/usage/users/${USER}`, VIEWER);
                assert.equal(res.body.user.displayName, "Una User");
            });
            // API-12: searches and names use the caller's session
            assert.ok(authApi.calls.users.length > 0);
            assert.ok(
                authApi.calls.users.every((call) => call.userId === VIEWER)
            );
        });

        it("still answers with IDs when the user lookup fails", async () => {
            authApi.users.get(VIEWER)!.usersStatus = 500;
            await useTokens(USER, "shared-model", today().day, { input: 1 });
            await withApp(async (get) => {
                const res = await get(`/v0/usage/users/${USER}`, VIEWER);
                assert.equal(res.status, 200, res.text);
                assert.deepEqual(res.body.user, { id: USER });
                const list = await get("/v0/usage/users", VIEWER);
                assert.deepEqual(list.body.items[0].user, { id: USER });
                // but a search that can't run is an error, not "nobody"
                const search = await get("/v0/usage/users?q=una", VIEWER);
                assert.equal(search.status, 503);
            });
        });
    });

    describe("outages", () => {
        it("answers 503 llm_usage_unavailable when the ledger can't be read, without leaking the error", async () => {
            const broken = new pg.Pool({
                host: "127.0.0.1",
                port: 1,
                user: "nobody",
                password: "secret-password",
                database: "llm",
                connectionTimeoutMillis: 500
            });
            const { error } = console;
            console.error = () => undefined;
            try {
                await withApp(
                    async (get) => {
                        for (const [path, userId] of [
                            ["/v0/usage/me", USER],
                            ["/v0/usage/me/daily", USER],
                            ["/v0/usage/users", VIEWER],
                            [`/v0/usage/users/${USER}`, VIEWER]
                        ]) {
                            const res = await get(path, userId);
                            assert.equal(res.status, 503, path);
                            assert.equal(
                                res.body.error.code,
                                "llm_usage_unavailable"
                            );
                            assert.ok(
                                !/ECONNREFUSED|secret|127\.0/.test(res.text)
                            );
                        }
                    },
                    { pool: broken }
                );
            } finally {
                console.error = error;
                await broken.end();
            }
        });

        it("answers 503 without a database", async () => {
            await withApp(
                async (get) => {
                    const res = await get("/v0/usage/me", USER);
                    assert.equal(res.status, 503);
                    assert.equal(res.body.error.code, "llm_usage_unavailable");
                },
                { pool: undefined }
            );
        });

        it("answers 503 when the Auth API can't verify the caller", async () => {
            authApi.users.get(USER)!.whoamiStatus = 500;
            const { error } = console;
            console.error = () => undefined;
            try {
                await withApp(async (get) => {
                    const res = await get("/v0/usage/me", USER);
                    assert.equal(res.status, 503);
                });
            } finally {
                console.error = error;
            }
        });
    });
});

describe("parseNoAccessHelp (DEP-3)", () => {
    it("accepts text, an http(s) link, both or neither", () => {
        assert.equal(parseNoAccessHelp({}), undefined);
        assert.equal(
            parseNoAccessHelp({
                NO_ACCESS_HELP_TEXT: "  ",
                NO_ACCESS_HELP_URL: ""
            }),
            undefined
        );
        assert.deepEqual(parseNoAccessHelp({ NO_ACCESS_HELP_TEXT: " Ask " }), {
            text: "Ask"
        });
        assert.deepEqual(
            parseNoAccessHelp({ NO_ACCESS_HELP_URL: "https://x.test/a" }),
            { url: "https://x.test/a" }
        );
    });

    it("rejects script links, relative links and over-long text", () => {
        for (const url of [
            "javascript:alert(1)",
            "/help",
            "data:text/html,x"
        ]) {
            assert.throws(() => parseNoAccessHelp({ NO_ACCESS_HELP_URL: url }));
        }
        assert.throws(() =>
            parseNoAccessHelp({ NO_ACCESS_HELP_TEXT: "x".repeat(1001) })
        );
    });
});
