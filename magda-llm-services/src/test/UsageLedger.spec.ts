import assert from "node:assert/strict";
import pg from "pg";
import UsageLedger from "../usage/UsageLedger.js";
import { UsageSettlement } from "../metering/settlement.js";
import { createTestDatabase } from "./testDb.js";
import { randomUUID } from "node:crypto";

const USER_A = "00000000-0000-4000-8000-00000000000a";
const USER_B = "00000000-0000-4000-8000-00000000000b";
const MODEL_1 = "magda-agent-default";
const MODEL_2 = "magda-agent-mini";

function measured(
    at: string,
    inputTokens: number,
    outputTokens: number,
    overrides: Partial<UsageSettlement> = {}
): UsageSettlement {
    return {
        requestId: randomUUID(),
        userId: USER_A,
        modelAlias: MODEL_1,
        requestStartedAt: new Date(at),
        endpoint: "/v1/responses",
        quality: { status: 200 },
        kind: "measured",
        inputTokens,
        outputTokens,
        ...overrides
    } as UsageSettlement;
}

function estimated(at: string, tokens: number): UsageSettlement {
    return {
        requestId: randomUUID(),
        userId: USER_A,
        modelAlias: MODEL_1,
        requestStartedAt: new Date(at),
        endpoint: "/v1/chat/completions",
        quality: {},
        kind: "estimated",
        estimatedTokens: tokens,
        reason: "interrupted"
    };
}

function quiet<T>(run: () => Promise<T>): Promise<T> {
    const { log, warn, error } = console;
    console.log = console.warn = console.error = () => undefined;
    return run().finally(() => {
        Object.assign(console, { log, warn, error });
    });
}

describe("UsageLedger (integration, #3838 #3942)", function (this: Mocha.Suite) {
    this.timeout(30000);
    let pool: pg.Pool;
    let drop: () => Promise<void>;
    let ledger: UsageLedger;

    before(async () => {
        ({ pool, drop } = await createTestDatabase("ledger"));
    });

    after(async () => {
        await drop?.();
    });

    beforeEach(async () => {
        await pool.query("TRUNCATE daily_model_usage");
        ledger = new UsageLedger(pool, { timeZone: "Australia/Sydney" });
    });

    async function rows() {
        return (
            await pool.query(
                `SELECT user_id, model_alias, to_char(local_date, 'YYYY-MM-DD') AS local_date,
                    measured_input_tokens::int AS i, measured_output_tokens::int AS o,
                    estimated_tokens::int AS e, estimated_requests::int AS r
                FROM daily_model_usage ORDER BY local_date, user_id, model_alias`
            )
        ).rows;
    }

    it("settles measured and estimated usage into one row per user, alias and local date (USE-7)", async () => {
        await quiet(async () => {
            await ledger.settle(measured("2026-11-21T01:00:00Z", 100, 20));
            await ledger.settle(measured("2026-11-21T02:00:00Z", 5, 1));
            await ledger.settle(estimated("2026-11-21T03:00:00Z", 4100));
        });
        assert.deepEqual(await rows(), [
            {
                user_id: USER_A,
                model_alias: MODEL_1,
                local_date: "2026-11-21",
                i: 105,
                o: 21,
                e: 4100,
                r: 1
            }
        ]);
    });

    it("attributes a request to the Sydney date it started, even if it settles the next day (USE-3)", async () => {
        // started 23:59:30 AEDT on 30 November; its stream ends in December
        const settlement = measured("2026-11-30T12:59:30Z", 10, 10);
        await quiet(() => ledger.settle(settlement));
        assert.equal((await rows())[0].local_date, "2026-11-30");
        assert.deepEqual(
            await ledger.periodUsage(
                USER_A,
                MODEL_1,
                new Date("2026-11-30T13:00:30Z")
            ),
            { day: 0, week: 20, month: 0 }
        );
    });

    it("keeps separate counters per user and per alias (USE-2, MODEL-3)", async () => {
        await quiet(async () => {
            await ledger.settle(measured("2026-11-21T01:00:00Z", 1, 1));
            await ledger.settle(
                measured("2026-11-21T01:00:00Z", 10, 10, {
                    modelAlias: MODEL_2
                })
            );
            await ledger.settle(
                measured("2026-11-21T01:00:00Z", 100, 100, { userId: USER_B })
            );
        });
        const at = new Date("2026-11-21T05:00:00Z");
        assert.deepEqual(await ledger.periodUsage(USER_A, MODEL_1, at), {
            day: 2,
            week: 2,
            month: 2
        });
        assert.deepEqual(await ledger.periodUsage(USER_A, MODEL_2, at), {
            day: 20,
            week: 20,
            month: 20
        });
        assert.deepEqual(await ledger.periodUsage(USER_B, MODEL_1, at), {
            day: 200,
            week: 200,
            month: 200
        });
        assert.deepEqual(await ledger.periodUsage(USER_B, MODEL_2, at), {
            day: 0,
            week: 0,
            month: 0
        });
    });

    it("sums day, ISO week and month with half-open ranges (USE-4)", async () => {
        await pool.query(
            `INSERT INTO daily_model_usage (user_id, model_alias, local_date, measured_input_tokens, estimated_tokens)
            VALUES ($1, $2, '2026-10-31', 1, 0), -- Saturday: previous month, the week of 26 Oct
                   ($1, $2, '2026-11-01', 10, 0), -- Sunday: ends the week of 26 Oct
                   ($1, $2, '2026-11-02', 100, 0), -- Monday: starts the week of 2 Nov
                   ($1, $2, '2026-11-08', 1000, 0), -- Sunday, same week
                   ($1, $2, '2026-11-09', 0, 10000), -- next Monday
                   ($1, $2, '2026-11-30', 100000, 0),
                   ($1, $2, '2026-12-01', 1000000, 0)`,
            [USER_A, MODEL_1]
        );
        // Sunday 8 November 2026, noon AEDT
        assert.deepEqual(
            await ledger.periodUsage(
                USER_A,
                MODEL_1,
                new Date("2026-11-08T01:00:00Z")
            ),
            { day: 1000, week: 1100, month: 111110 }
        );
        // Sunday 1 November: its week reaches back into October
        assert.deepEqual(
            await ledger.periodUsage(
                USER_A,
                MODEL_1,
                new Date("2026-11-01T01:00:00Z")
            ),
            { day: 10, week: 11, month: 111110 }
        );
        // Tuesday 1 December: its week (Mon 30 Nov) reaches back into November
        assert.deepEqual(
            await ledger.periodUsage(
                USER_A,
                MODEL_1,
                new Date("2026-12-01T01:00:00Z")
            ),
            { day: 1000000, week: 1100000, month: 1000000 }
        );
    });

    it("counts both DST transition days in their own local dates", async () => {
        await quiet(async () => {
            // 23:30 AEST 3 Oct, 00:30 AEST 4 Oct, 23:30 AEDT 4 Oct, 00:30 AEDT 5 Oct
            for (const at of [
                "2026-10-03T13:30:00Z",
                "2026-10-03T14:30:00Z",
                "2026-10-04T12:30:00Z",
                "2026-10-04T13:30:00Z"
            ]) {
                await ledger.settle(measured(at, 1, 0));
            }
            // 23:30 AEDT 4 Apr, 23:30 AEST 5 Apr
            for (const at of ["2026-04-04T12:30:00Z", "2026-04-05T13:30:00Z"]) {
                await ledger.settle(measured(at, 1, 0));
            }
        });
        assert.deepEqual(
            (await rows()).map((row) => [row.local_date, row.i]),
            [
                ["2026-04-04", 1],
                ["2026-04-05", 1],
                ["2026-10-03", 1],
                ["2026-10-04", 2],
                ["2026-10-05", 1]
            ]
        );
    });

    it("gives the exact total under concurrent settlements", async () => {
        const settlements = Array.from({ length: 60 }, (_, i) =>
            measured("2026-11-21T01:00:00Z", i + 1, 1)
        );
        await quiet(() =>
            Promise.all(settlements.map((s) => ledger.settle(s)))
        );
        const [row] = await rows();
        assert.equal(row.i, (60 * 61) / 2);
        assert.equal(row.o, 60);
    });

    it("never counts a repeated settlement of the same request twice (METER-5)", async () => {
        const settlement = measured("2026-11-21T01:00:00Z", 50, 50);
        await quiet(() =>
            Promise.all([
                ledger.settle(settlement),
                ledger.settle(settlement),
                ledger.settle({ ...settlement })
            ])
        );
        await quiet(() => ledger.settle(settlement));
        const [row] = await rows();
        assert.equal(row.i + row.o, 100);
    });

    it("gates bounded admission after a failed write until a health check passes (USE-10)", async () => {
        let failWrites = true;
        let failConnect = true;
        const flaky = ({
            query: (...args: any[]) =>
                failWrites
                    ? Promise.reject(new Error("connection terminated"))
                    : (pool.query as any)(...args),
            connect: () =>
                failConnect
                    ? Promise.reject(new Error("connection refused"))
                    : pool.connect()
        } as unknown) as pg.Pool;
        const gated = new UsageLedger(flaky, {
            timeZone: "Australia/Sydney",
            healthProbeIntervalMs: 50
        });
        const errors: string[] = [];
        const originalError = console.error;
        console.error = (line: string) => errors.push(String(line));
        try {
            assert.equal(await gated.readyForBoundedAdmission(), true);
            const settlement = measured("2026-11-21T01:00:00Z", 7, 7);
            await gated.settle(settlement); // never throws
            assert.equal(gated.admissionGated, true);
            const critical = JSON.parse(
                errors.find((e) => e.includes("llm-usage-ledger-write-failed"))!
            );
            assert.equal(critical.severity, "CRITICAL");
            assert.equal(critical.tokens, 14);

            // the health probe fails: stay gated, and probe at most once per interval
            assert.equal(await gated.readyForBoundedAdmission(), false);
            failConnect = false;
            assert.equal(await gated.readyForBoundedAdmission(), false);
            await new Promise((resolve) => setTimeout(resolve, 60));
            const [a, b] = await Promise.all([
                gated.readyForBoundedAdmission(),
                gated.readyForBoundedAdmission()
            ]);
            assert.deepEqual([a, b], [true, true]);
            assert.equal(gated.admissionGated, false);

            // the failed request is not retried, and the probe wrote nothing
            failWrites = false;
            await quiet(() => gated.settle(settlement));
            assert.deepEqual(await rows(), []);
        } finally {
            console.error = originalError;
        }
    });

    it("reports all-time totals and paginated daily history (DATA-6)", async () => {
        await pool.query(
            `INSERT INTO daily_model_usage
                (user_id, model_alias, local_date, measured_input_tokens, measured_output_tokens, estimated_tokens, estimated_requests)
            VALUES ($1, $2, '2025-01-15', 10, 5, 0, 0),
                   ($1, $2, '2026-11-20', 100, 50, 4000, 1),
                   ($1, $3, '2026-11-21', 1, 1, 0, 0),
                   ($4, $2, '2026-11-21', 999, 999, 0, 0)`,
            [USER_A, MODEL_1, MODEL_2, USER_B]
        );
        assert.deepEqual(await ledger.totals(USER_A), {
            total: {
                tokens: 4167,
                measuredInputTokens: 111,
                measuredOutputTokens: 56,
                estimatedTokens: 4000,
                estimatedRequests: 1
            },
            byModel: [
                {
                    modelAlias: MODEL_1,
                    tokens: 4165,
                    measuredInputTokens: 110,
                    measuredOutputTokens: 55,
                    estimatedTokens: 4000,
                    estimatedRequests: 1
                },
                {
                    modelAlias: MODEL_2,
                    tokens: 2,
                    measuredInputTokens: 1,
                    measuredOutputTokens: 1,
                    estimatedTokens: 0,
                    estimatedRequests: 0
                }
            ]
        });
        assert.deepEqual(
            await ledger.totals("00000000-0000-4000-8000-0000000000ff"),
            {
                total: {
                    tokens: 0,
                    measuredInputTokens: 0,
                    measuredOutputTokens: 0,
                    estimatedTokens: 0,
                    estimatedRequests: 0
                },
                byModel: []
            }
        );

        const page1 = await ledger.dailyHistory(USER_A, { limit: 2 });
        assert.equal(page1.total, 3);
        assert.deepEqual(
            page1.items.map((r) => [r.localDate, r.modelAlias, r.tokens]),
            [
                ["2026-11-21", MODEL_2, 2],
                ["2026-11-20", MODEL_1, 4150]
            ]
        );
        const page2 = await ledger.dailyHistory(USER_A, {
            limit: 2,
            offset: 2
        });
        assert.deepEqual(
            page2.items.map((r) => r.localDate),
            ["2025-01-15"]
        );
        const filtered = await ledger.dailyHistory(USER_A, {
            modelAlias: MODEL_1,
            fromDate: "2026-01-01",
            toDate: "2026-11-21"
        });
        assert.equal(filtered.total, 1);
        assert.deepEqual(filtered.items[0], {
            localDate: "2026-11-20",
            modelAlias: MODEL_1,
            tokens: 4150,
            measuredInputTokens: 100,
            measuredOutputTokens: 50,
            estimatedTokens: 4000,
            estimatedRequests: 1
        });
    });
});
