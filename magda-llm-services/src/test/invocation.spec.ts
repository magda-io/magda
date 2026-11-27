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
import UsageLedger from "../usage/UsageLedger.js";
import CallerAccessResolver, {
    parseDecisionCacheSeconds
} from "../access/CallerAccess.js";
import { localDateOf } from "../usage/periods.js";
import { createTestDatabase } from "./testDb.js";
import { ADMIN_ROLE, FakeAuthApi, startFakeAuthApi } from "./fakeAuthApi.js";

describe("decision cache configuration (EVAL-3)", () => {
    it("caps revocation delay at 30 seconds, including direct construction", () => {
        assert.equal(parseDecisionCacheSeconds(undefined), 30);
        assert.equal(parseDecisionCacheSeconds("0"), 0);
        assert.equal(parseDecisionCacheSeconds("30"), 30);
        for (const value of ["31", "300", "-1", "0.5", "NaN"]) {
            assert.throws(() => parseDecisionCacheSeconds(value));
            assert.throws(
                () =>
                    new CallerAccessResolver({
                        jwtSecret: "test",
                        authApiUrl: "http://localhost/v0",
                        decisionCacheSeconds: Number(value)
                    })
            );
        }
    });
});

// #3838 #3941: profile-based invocation through the service: one cached
// partial decision per caller (EVAL-1, EVAL-3), eligibility plus quota
// admission in one SQL query (USE-6), and filtered model discovery (API-9).

const RECORDED = JSON.parse(
    fs.readFileSync(
        path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "fixtures/llmInvokeDecisions.json"
        ),
        "utf8"
    )
);

const jwtSecret = "llm-services-invocation-secret";
const TIME_ZONE = "Australia/Sydney";
const USER = "00000000-0000-4000-8000-000000000123";
const OTHER_USER = "00000000-0000-4000-8000-000000000456";
const ADMIN = "00000000-0000-4000-8000-000000000789";

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

/** One alias per recorded profile, so model discovery reveals eligibility. */
function aliasOf(profileId: string) {
    return `model-${profileId.slice(-2)}`;
}

interface ProfileSeed {
    id: string;
    allowedModels: string[];
    enabled?: boolean;
    orgUnitId?: string | null;
    usePermissionId?: string;
    constraintExemption?: boolean;
    daily?: number | null;
    weekly?: number | null;
    monthly?: number | null;
}

describe("profile-based model invocation (integration, #3838 #3941)", function (this: Mocha.Suite) {
    this.timeout(30000);
    let pool: pg.Pool;
    let drop: () => Promise<void>;
    let authApi: FakeAuthApi;
    let upstream: Awaited<ReturnType<typeof listen>>;
    let upstreamRequests: Array<{ path?: string; body: any }>;
    /** What LiteLLM's /v1/models serves; `null` = unavailable. */
    let served: string[] | null;
    let usagePerResponse: { input: number; output: number };
    let upstreamGate: (() => Promise<void>) | undefined;

    const RECORDED_ALIASES: string[] = RECORDED.profiles.map((p: any) =>
        aliasOf(p.id)
    );
    const allowedModels = new Set([
        ...RECORDED_ALIASES,
        "shared-model",
        "second-model",
        "unserved-model"
    ]);

    const { log } = console;

    before(async () => {
        // settlement events are logged asynchronously, after responses end
        console.log = () => undefined;
        ({ pool, drop } = await createTestDatabase("invocation"));
        upstream = await listen((req, res) => {
            const chunks: Buffer[] = [];
            req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
            req.on("end", async () => {
                if (req.method === "GET" && req.url === "/v1/models") {
                    if (!served) {
                        res.writeHead(503).end();
                        return;
                    }
                    res.writeHead(200, { "content-type": "application/json" });
                    res.end(
                        JSON.stringify({
                            object: "list",
                            data: served.map((id) => ({ id, object: "model" }))
                        })
                    );
                    return;
                }
                const body = JSON.parse(Buffer.concat(chunks).toString());
                upstreamRequests.push({ path: req.url, body });
                await upstreamGate?.();
                res.writeHead(200, { "content-type": "application/json" });
                res.end(
                    JSON.stringify({
                        object: "chat.completion",
                        usage: {
                            prompt_tokens: usagePerResponse.input,
                            completion_tokens: usagePerResponse.output,
                            total_tokens:
                                usagePerResponse.input + usagePerResponse.output
                        }
                    })
                );
            });
        });
    });

    after(async () => {
        console.log = log;
        if (upstream) await close(upstream.server);
        await drop?.();
    });

    beforeEach(async () => {
        await pool.query("TRUNCATE access_profiles, daily_model_usage");
        authApi = await startFakeAuthApi();
        authApi.users.set(ADMIN, { roles: [ADMIN_ROLE] });
        upstreamRequests = [];
        served = [...allowedModels].filter((m) => m !== "unserved-model");
        usagePerResponse = { input: 7, output: 3 };
        upstreamGate = undefined;
    });

    afterEach(async () => {
        await authApi.close();
    });

    function grant(userId: string, scenario: string) {
        const decision = RECORDED.decisions[scenario];
        assert.ok(decision, scenario);
        authApi.users.set(userId, { roles: [], decision });
    }

    let permissionCounter = 0;
    async function seed(profile: ProfileSeed) {
        await pool.query(
            `INSERT INTO access_profiles
                (id, name, allowed_models, enabled, org_unit_id,
                 constraint_exemption, use_permission_id,
                 allowed_daily_tokens, allowed_weekly_tokens, allowed_monthly_tokens)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                profile.id,
                `Profile ${profile.id.slice(-4)}`,
                profile.allowedModels,
                profile.enabled ?? true,
                profile.orgUnitId ?? null,
                profile.constraintExemption ?? false,
                profile.usePermissionId ??
                    `00000000-0000-4000-9000-${String(
                        ++permissionCounter
                    ).padStart(12, "0")}`,
                profile.daily ?? null,
                profile.weekly ?? null,
                profile.monthly ?? null
            ]
        );
    }

    /** Seed the recorded fixtures' profiles, one alias each. */
    async function seedRecordedProfiles(overrides: Partial<ProfileSeed> = {}) {
        for (const p of RECORDED.profiles) {
            await seed({
                id: p.id,
                allowedModels: [aliasOf(p.id)],
                orgUnitId: p.org_unit_id,
                usePermissionId: p.use_permission_id,
                constraintExemption: p.constraint_exemption,
                ...overrides
            });
        }
    }

    async function useTokens(
        userId: string,
        alias: string,
        tokens: number,
        localDate = localDateOf(new Date(), TIME_ZONE)
    ) {
        await pool.query(
            `INSERT INTO daily_model_usage (user_id, model_alias, local_date, measured_input_tokens)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, model_alias, local_date)
            DO UPDATE SET measured_input_tokens = daily_model_usage.measured_input_tokens + EXCLUDED.measured_input_tokens`,
            [userId, alias, localDate, tokens]
        );
    }

    async function usedTokens(userId: string, alias: string) {
        const result = await pool.query(
            `SELECT COALESCE(SUM(measured_input_tokens + measured_output_tokens + estimated_tokens), 0)::int AS used
            FROM daily_model_usage WHERE user_id = $1 AND model_alias = $2`,
            [userId, alias]
        );
        return result.rows[0].used as number;
    }

    async function withApp(
        run: (client: ReturnType<typeof clientOf>) => Promise<void>,
        overrides: Partial<LlmServicesConfig> = {}
    ) {
        const app = await listen(
            createApp({
                jwtSecret,
                authApiUrl: authApi.url,
                liteLlmUrl: upstream.url,
                liteLlmKey: "master-key",
                allowedModels,
                pool,
                usageTimeZone: TIME_ZONE,
                // no caching unless a test asks for it
                decisionCacheSeconds: 0,
                ...overrides
            })
        );
        try {
            await run(clientOf(app.url));
        } finally {
            await close(app.server);
        }
    }

    function clientOf(appUrl: URL) {
        return {
            async models(userId: string): Promise<string[]> {
                const response = await fetch(new URL("/v0/v1/models", appUrl), {
                    headers: { "X-Magda-Session": sessionOf(userId) }
                });
                assert.equal(
                    response.status,
                    200,
                    await response.clone().text()
                );
                const body = await response.json();
                return body.data.map((m: any) => m.id);
            },
            async invoke(userId: string, model: string) {
                const response = await fetch(
                    new URL("/v0/v1/chat/completions", appUrl),
                    {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            "X-Magda-Session": sessionOf(userId)
                        },
                        body: JSON.stringify({ model, messages: [] })
                    }
                );
                const text = await response.text();
                return {
                    status: response.status,
                    headers: response.headers,
                    body: text ? JSON.parse(text) : undefined
                };
            }
        };
    }

    /** Wait until settlements reach the ledger. */
    async function waitForUsage(userId: string, alias: string, tokens: number) {
        for (let i = 0; i < 100; i++) {
            if ((await usedTokens(userId, alias)) >= tokens) return;
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        assert.fail(`usage of ${alias} never reached ${tokens}`);
    }

    describe("TEST-2: recorded partial decisions select exactly the profiles full decisions allow", () => {
        for (const scenario of Object.keys(RECORDED.expectedProfileIds)) {
            it(scenario, async () => {
                await seedRecordedProfiles();
                grant(USER, scenario);
                const expected: string[] = RECORDED.expectedProfileIds[
                    scenario
                ].map(aliasOf);
                await withApp(async (client) => {
                    assert.deepEqual(await client.models(USER), expected);
                    for (const alias of RECORDED_ALIASES) {
                        const { status } = await client.invoke(USER, alias);
                        assert.equal(
                            status,
                            expected.includes(alias) ? 200 : 403,
                            alias
                        );
                    }
                });
                // one partial decision per request, always with the profile unknown
                assert.ok(authApi.calls.decisions.length > 0);
                for (const call of authApi.calls.decisions) {
                    assert.equal(
                        call.path,
                        "/v0/opa/decision/llm/access/invoke"
                    );
                    assert.deepEqual(call.body, {
                        unknowns: ["input.object.llmAccessProfile"]
                    });
                }
            });
        }

        it("grants each AUTH-4 type and denies an unrelated user", async () => {
            await seedRecordedProfiles();
            const cases: Array<[string, string, number]> = [
                // a role-attached grant: the profile's own pre-authorised permission
                [
                    "profile pre-authorised permission",
                    aliasOf(RECORDED.profiles[0].id),
                    200
                ],
                // an audience grant: the user's org unit's ancestor
                [
                    "audience org unit (user in Finance)",
                    aliasOf(RECORDED.profiles[1].id),
                    200
                ],
                // a Public profile, with an exemption-capable grant
                [
                    "exemption-capable audience permission",
                    aliasOf(RECORDED.profiles[3].id),
                    200
                ],
                // unconstrained: any profile
                ["unconstrained", aliasOf(RECORDED.profiles[4].id), 200],
                // a Public profile without an exemption-capable grant
                [
                    "audience org unit (user in Finance)",
                    aliasOf(RECORDED.profiles[3].id),
                    403
                ],
                // an unrelated user
                ["no permission", aliasOf(RECORDED.profiles[3].id), 403]
            ];
            await withApp(async (client) => {
                for (const [scenario, alias, status] of cases) {
                    grant(USER, scenario);
                    const result = await client.invoke(USER, alias);
                    assert.equal(result.status, status, `${scenario} ${alias}`);
                }
            });
        });

        it("doesn't need agentWorkspace/access: only the invoke decision is asked", async () => {
            await seedRecordedProfiles();
            grant(USER, "exemption-capable audience permission");
            await withApp(async (client) => {
                const alias = aliasOf(RECORDED.profiles[3].id);
                assert.equal((await client.invoke(USER, alias)).status, 200);
            });
            assert.ok(
                authApi.calls.decisions.every(
                    (call) => !call.path.includes("agentWorkspace")
                )
            );
        });
    });

    describe("eligibility and model coverage (MODEL-1, MODEL-2)", () => {
        it("ignores disabled profiles", async () => {
            await seed({
                id: "00000000-0000-4000-8000-0000000000d1",
                allowedModels: ["shared-model"],
                enabled: false
            });
            grant(USER, "unconstrained");
            await withApp(async (client) => {
                assert.deepEqual(await client.models(USER), []);
                const result = await client.invoke(USER, "shared-model");
                assert.equal(result.status, 403);
                assert.equal(result.body.error.code, "llm_no_eligible_profile");
                assert.equal(upstreamRequests.length, 0);
            });
        });

        it("drops an alias the operator removed from the allowlist", async () => {
            await seed({
                id: "00000000-0000-4000-8000-0000000000e1",
                allowedModels: ["shared-model", "retired-model"]
            });
            grant(USER, "unconstrained");
            await withApp(async (client) => {
                assert.deepEqual(await client.models(USER), ["shared-model"]);
                const result = await client.invoke(USER, "retired-model");
                assert.equal(result.status, 403);
                assert.match(
                    result.body.error.message,
                    /model is not available/
                );
            });
        });

        it("covers allowed and served aliases with *, or the allowlist when the backend list is unavailable", async () => {
            await seed({
                id: "00000000-0000-4000-8000-0000000000f1",
                allowedModels: ["*"]
            });
            grant(USER, "unconstrained");
            await withApp(async (client) => {
                const models = await client.models(USER);
                assert.ok(models.includes("shared-model"));
                assert.ok(!models.includes("unserved-model"));
                assert.equal(
                    (await client.invoke(USER, "unserved-model")).status,
                    403
                );
                assert.equal(
                    (await client.invoke(USER, "shared-model")).status,
                    200
                );
            });
            served = null;
            const { warn } = console;
            console.warn = () => undefined;
            try {
                await withApp(async (client) => {
                    assert.deepEqual(await client.models(USER), [
                        ...allowedModels
                    ]);
                    assert.equal(
                        (await client.invoke(USER, "unserved-model")).status,
                        200
                    );
                });
            } finally {
                console.warn = warn;
            }
        });

        it("lets administrators use every allowed alias without a profile, still inside the allowlist (AUTH-10)", async () => {
            await withApp(async (client) => {
                assert.deepEqual(await client.models(ADMIN), [
                    ...allowedModels
                ]);
                assert.equal(
                    (await client.invoke(ADMIN, "shared-model")).status,
                    200
                );
                assert.equal(
                    (await client.invoke(ADMIN, "not-allowed")).status,
                    403
                );
            });
            // the administrator never needs a decision on profiles
            assert.deepEqual(authApi.calls.decisions, []);
        });
    });

    describe("quota admission (USE-5, USE-6, TEST-6)", () => {
        it("allows concurrent soft overshoot, then refuses the next request without forwarding", async () => {
            await seed({
                id: "00000000-0000-4000-8000-000000000911",
                allowedModels: ["shared-model"],
                daily: 1
            });
            grant(USER, "unconstrained");
            let release!: () => void;
            let arrived!: () => void;
            const held = new Promise<void>((resolve) => {
                release = resolve;
            });
            const bothForwarded = new Promise<void>((resolve) => {
                arrived = resolve;
            });
            upstreamGate = async () => {
                if (upstreamRequests.length === 2) arrived();
                await held;
            };
            await withApp(async (client) => {
                const calls = [
                    client.invoke(USER, "shared-model"),
                    client.invoke(USER, "shared-model")
                ];
                let timer: NodeJS.Timeout | undefined;
                try {
                    await Promise.race([
                        bothForwarded,
                        new Promise((_, reject) => {
                            timer = setTimeout(
                                () =>
                                    reject(
                                        new Error(
                                            "Two soft-limit requests were not forwarded"
                                        )
                                    ),
                                3000
                            );
                        })
                    ]);
                    assert.equal(await usedTokens(USER, "shared-model"), 0);
                } finally {
                    clearTimeout(timer);
                    release();
                }
                assert.deepEqual(
                    (await Promise.all(calls)).map((r) => r.status),
                    [200, 200]
                );
                await waitForUsage(USER, "shared-model", 20);
                assert.equal(await usedTokens(USER, "shared-model"), 20);
                assert.equal(
                    (await client.invoke(USER, "shared-model")).status,
                    429
                );
                assert.equal(upstreamRequests.length, 2);
            });
        });
        it("answers 429 llm_quota_exceeded once a limit is used up, and 403 without a profile", async () => {
            await seed({
                id: "00000000-0000-4000-8000-0000000000a1",
                allowedModels: ["shared-model"],
                daily: 100
            });
            grant(USER, "unconstrained");
            grant(OTHER_USER, "no permission");
            await withApp(async (client) => {
                await useTokens(USER, "shared-model", 99);
                assert.equal(
                    (await client.invoke(USER, "shared-model")).status,
                    200
                );
                await waitForUsage(USER, "shared-model", 109);
                const exceeded = await client.invoke(USER, "shared-model");
                assert.equal(exceeded.status, 429);
                assert.equal(exceeded.body.error.code, "llm_quota_exceeded");
                assert.equal(exceeded.headers.get("x-should-retry"), "false");
                assert.equal(
                    exceeded.headers.get("cache-control"),
                    "private, no-store"
                );
                // the model is still listed although its quota is used up (API-9)
                assert.deepEqual(await client.models(USER), ["shared-model"]);
                // no profile: 403, not 429
                const denied = await client.invoke(OTHER_USER, "shared-model");
                assert.equal(denied.status, 403);
            });
            // a refused request costs nothing and reaches no upstream
            assert.equal(upstreamRequests.length, 1);
            assert.equal(await usedTokens(USER, "shared-model"), 109);
        });

        it("treats 0 as blocking and NULL as unlimited (DATA-3)", async () => {
            await seed({
                id: "00000000-0000-4000-8000-0000000000a2",
                allowedModels: ["shared-model"],
                daily: 0
            });
            await seed({
                id: "00000000-0000-4000-8000-0000000000a3",
                allowedModels: ["second-model"]
            });
            grant(USER, "unconstrained");
            await withApp(async (client) => {
                assert.equal(
                    (await client.invoke(USER, "shared-model")).status,
                    429
                );
                await useTokens(USER, "second-model", 1e12);
                assert.equal(
                    (await client.invoke(USER, "second-model")).status,
                    200
                );
            });
        });

        it("combines profiles as OR and never stacks their limits", async () => {
            // A: 100 a day. B: 1000 a month.
            await seed({
                id: "00000000-0000-4000-8000-0000000000b1",
                allowedModels: ["shared-model"],
                daily: 100
            });
            await seed({
                id: "00000000-0000-4000-8000-0000000000b2",
                allowedModels: ["shared-model"],
                monthly: 1000
            });
            grant(USER, "unconstrained");
            await withApp(async (client) => {
                // 150 today: A is exhausted, B still admits
                await useTokens(USER, "shared-model", 150);
                assert.equal(
                    (await client.invoke(USER, "shared-model")).status,
                    200
                );
                await waitForUsage(USER, "shared-model", 160);
                // 1000 this month: both are exhausted. Stacking would allow 1100.
                await useTokens(USER, "shared-model", 840);
                assert.equal(
                    (await client.invoke(USER, "shared-model")).status,
                    429
                );
            });
        });

        it("keeps separate counters per alias and per user (MODEL-3)", async () => {
            await seed({
                id: "00000000-0000-4000-8000-0000000000c1",
                allowedModels: ["*"],
                daily: 50
            });
            grant(USER, "unconstrained");
            grant(OTHER_USER, "unconstrained");
            await withApp(async (client) => {
                await useTokens(USER, "shared-model", 50);
                assert.equal(
                    (await client.invoke(USER, "shared-model")).status,
                    429
                );
                assert.equal(
                    (await client.invoke(USER, "second-model")).status,
                    200
                );
                assert.equal(
                    (await client.invoke(OTHER_USER, "shared-model")).status,
                    200
                );
            });
        });

        it("records administrator usage without limiting it (USE-9)", async () => {
            await seed({
                id: "00000000-0000-4000-8000-0000000000c2",
                allowedModels: ["shared-model"],
                daily: 0
            });
            await withApp(async (client) => {
                await useTokens(ADMIN, "shared-model", 1_000_000);
                assert.equal(
                    (await client.invoke(ADMIN, "shared-model")).status,
                    200
                );
                await waitForUsage(ADMIN, "shared-model", 1_000_010);
            });
        });

        it("settles measured usage against the request's start date", async () => {
            await seed({
                id: "00000000-0000-4000-8000-0000000000c3",
                allowedModels: ["shared-model"],
                daily: 1000
            });
            grant(USER, "unconstrained");
            usagePerResponse = { input: 120, output: 30 };
            await withApp(async (client) => {
                assert.equal(
                    (await client.invoke(USER, "shared-model")).status,
                    200
                );
                await waitForUsage(USER, "shared-model", 150);
            });
            const rows = (
                await pool.query(
                    `SELECT to_char(local_date, 'YYYY-MM-DD') AS local_date,
                        measured_input_tokens::int AS i, measured_output_tokens::int AS o
                    FROM daily_model_usage WHERE user_id = $1`,
                    [USER]
                )
            ).rows;
            assert.deepEqual(rows, [
                {
                    local_date: localDateOf(new Date(), TIME_ZONE),
                    i: 120,
                    o: 30
                }
            ]);
        });
    });

    describe("ledger outage (USE-10)", () => {
        it("answers 503 when the ledger can't be read, but administrators keep working", async () => {
            await seed({
                id: "00000000-0000-4000-8000-0000000000a9",
                allowedModels: ["shared-model"]
            });
            grant(USER, "unconstrained");
            const broken = ({
                query: () => Promise.reject(new Error("connection refused")),
                connect: () => Promise.reject(new Error("connection refused"))
            } as unknown) as pg.Pool;
            const { error } = console;
            console.error = () => undefined;
            try {
                await withApp(
                    async (client) => {
                        const result = await client.invoke(
                            USER,
                            "shared-model"
                        );
                        assert.equal(result.status, 503);
                        assert.equal(
                            result.body.error.code,
                            "llm_usage_unavailable"
                        );
                        assert.equal(
                            (await client.invoke(ADMIN, "shared-model")).status,
                            200
                        );
                    },
                    { pool: broken }
                );
            } finally {
                console.error = error;
            }
            assert.equal(upstreamRequests.length, 1);
        });

        it("after a failed settlement write, gates bounded profiles until the ledger is healthy", async () => {
            await seed({
                id: "00000000-0000-4000-8000-0000000000aa",
                allowedModels: ["shared-model"],
                daily: 1_000_000
            });
            await seed({
                id: "00000000-0000-4000-8000-0000000000ab",
                allowedModels: ["second-model"]
            });
            grant(USER, "unconstrained");
            let healthy = false;
            const ledger = new UsageLedger(
                ({
                    query: (...args: any[]) =>
                        healthy
                            ? (pool.query as any)(...args)
                            : Promise.reject(new Error("write failed")),
                    connect: () =>
                        healthy
                            ? pool.connect()
                            : Promise.reject(new Error("connection refused"))
                } as unknown) as pg.Pool,
                { timeZone: TIME_ZONE, healthProbeIntervalMs: 0 }
            );
            const { error } = console;
            console.error = () => undefined;
            try {
                await withApp(
                    async (client) => {
                        // admitted (admission reads through the healthy pool),
                        // then its settlement write fails
                        assert.equal(
                            (await client.invoke(USER, "shared-model")).status,
                            200
                        );
                        for (
                            let i = 0;
                            i < 100 && !ledger.admissionGated;
                            i++
                        ) {
                            await new Promise((r) => setTimeout(r, 20));
                        }
                        assert.equal(ledger.admissionGated, true);
                        // bounded: 503; a profile without limits: normal path
                        assert.equal(
                            (await client.invoke(USER, "shared-model")).status,
                            503
                        );
                        assert.equal(
                            (await client.invoke(USER, "second-model")).status,
                            200
                        );
                        healthy = true;
                        assert.equal(
                            (await client.invoke(USER, "shared-model")).status,
                            200
                        );
                        assert.equal(ledger.admissionGated, false);
                    },
                    { ledger }
                );
            } finally {
                console.error = error;
            }
        });
    });

    describe("decision cache (EVAL-3)", () => {
        it("makes one decision per user per TTL, and a revoked grant stops working within it", async () => {
            await seedRecordedProfiles();
            grant(USER, "profile pre-authorised permission");
            const alias = aliasOf(RECORDED.profiles[0].id);
            await withApp(
                async (client) => {
                    assert.equal(
                        (await client.invoke(USER, alias)).status,
                        200
                    );
                    assert.equal(
                        (await client.invoke(USER, alias)).status,
                        200
                    );
                    assert.deepEqual(await client.models(USER), [alias]);
                    assert.equal(authApi.calls.decisions.length, 1);
                    // the grant is revoked: still cached until the TTL ends
                    grant(USER, "no permission");
                    assert.equal(
                        (await client.invoke(USER, alias)).status,
                        200
                    );
                    await new Promise((resolve) => setTimeout(resolve, 1100));
                    assert.equal(
                        (await client.invoke(USER, alias)).status,
                        403
                    );
                    assert.equal(authApi.calls.decisions.length, 2);
                },
                { decisionCacheSeconds: 1 }
            );
        });

        it("applies profile changes at once: profile attributes aren't cached", async () => {
            await seedRecordedProfiles();
            grant(USER, "profile pre-authorised permission");
            const alias = aliasOf(RECORDED.profiles[0].id);
            await withApp(
                async (client) => {
                    assert.equal(
                        (await client.invoke(USER, alias)).status,
                        200
                    );
                    await pool.query(
                        `UPDATE access_profiles SET enabled = FALSE WHERE id = $1`,
                        [RECORDED.profiles[0].id]
                    );
                    assert.equal(
                        (await client.invoke(USER, alias)).status,
                        403
                    );
                },
                { decisionCacheSeconds: 30 }
            );
        });
    });
});
