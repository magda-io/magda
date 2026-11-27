// The daily per-user, per-alias usage ledger (#3838 #3942): settlement writes,
// period sums for admission, totals, daily history and ledger health.
// See docs/design/agent-workspace/llm-access-profiles.md, "Soft usage ledger
// and quota".

import pg from "pg";
import SQLSyntax, { sqls } from "sql-syntax";
import { UsageSettlement, UsageSink } from "../metering/settlement.js";
import {
    DEFAULT_USAGE_TIME_ZONE,
    LocalDate,
    localDateOf,
    periodsAt,
    UsagePeriods
} from "./periods.js";
import { PeriodUsage } from "./quota.js";

/**
 * The tokens one row (or a sum of rows) counts towards a budget (USE-1):
 * measured input + output, plus estimates.
 */
const USED_TOKENS = sqls`(u.measured_input_tokens + u.measured_output_tokens + u.estimated_tokens)`;

/** The alias the period-sum fragment's columns are named under. */
export const PERIOD_USAGE_COLUMNS = {
    day: "day_used",
    week: "week_used",
    month: "month_used"
} as const;

/**
 * The SQL fragment summing a user's usage of one alias over the day, ISO week
 * and calendar month of `periods` (USE-4), from the daily rows with half-open
 * ranges. It is a complete `SELECT` returning exactly one row with the
 * columns `day_used`, `week_used` and `month_used` (BIGINT; 0 without rows).
 * Admission (#3941) joins it as a subquery, so profiles and sums are read in
 * one query (USE-6).
 */
export function periodUsageSql(
    userId: string,
    modelAlias: string,
    periods: UsagePeriods
): SQLSyntax {
    const from =
        periods.weekStart < periods.monthStart
            ? periods.weekStart
            : periods.monthStart;
    const to =
        periods.weekEnd > periods.monthEnd ? periods.weekEnd : periods.monthEnd;
    return sqls`SELECT
        COALESCE(SUM(${USED_TOKENS}) FILTER (
            WHERE u.local_date = ${periods.day}::date), 0)::BIGINT AS day_used,
        COALESCE(SUM(${USED_TOKENS}) FILTER (
            WHERE u.local_date >= ${periods.weekStart}::date
                AND u.local_date < ${periods.weekEnd}::date), 0)::BIGINT AS week_used,
        COALESCE(SUM(${USED_TOKENS}) FILTER (
            WHERE u.local_date >= ${periods.monthStart}::date
                AND u.local_date < ${periods.monthEnd}::date), 0)::BIGINT AS month_used
    FROM daily_model_usage u
    WHERE u.user_id = ${userId}::uuid AND u.model_alias = ${modelAlias}
        AND u.local_date >= ${from}::date AND u.local_date < ${to}::date`;
}

function toSafeInteger(value: unknown): number {
    // node-postgres returns BIGINT and NUMERIC as strings
    const n = Number(value ?? 0);
    if (!Number.isSafeInteger(n)) {
        throw new Error(`Usage value ${value} is not a safe integer`);
    }
    return n;
}

/** Read the period-sum columns of a row produced by `periodUsageSql`. */
export function rowToPeriodUsage(row: any): PeriodUsage {
    return {
        day: toSafeInteger(row[PERIOD_USAGE_COLUMNS.day]),
        week: toSafeInteger(row[PERIOD_USAGE_COLUMNS.week]),
        month: toSafeInteger(row[PERIOD_USAGE_COLUMNS.month])
    };
}

/** Usage amounts: a single daily row, or a sum of rows. */
export interface UsageAmounts {
    /** What counts towards budgets (USE-1): measured input + output + estimated. */
    tokens: number;
    measuredInputTokens: number;
    measuredOutputTokens: number;
    estimatedTokens: number;
    estimatedRequests: number;
}

export interface UsageTotals {
    /** All-time sum of all the user's rows (DATA-6: no pruning). */
    total: UsageAmounts;
    /** All-time sums per alias, by alias name. */
    byModel: Array<{ modelAlias: string } & UsageAmounts>;
}

export interface DailyUsageRow extends UsageAmounts {
    localDate: LocalDate;
    modelAlias: string;
}

export interface DailyHistoryOptions {
    modelAlias?: string;
    /** Inclusive. */
    fromDate?: LocalDate;
    /** Exclusive. */
    toDate?: LocalDate;
    offset?: number;
    limit?: number;
}

/** Sums for the all-time and the current day, ISO week and month. */
export interface PeriodAmounts {
    allTime: UsageAmounts;
    day: UsageAmounts;
    week: UsageAmounts;
    month: UsageAmounts;
}

export interface UsageSummary {
    /** The periods `day`, `week` and `month` are summed over (USE-4). */
    periods: UsagePeriods;
    /** Over every alias. */
    totals: PeriodAmounts;
    /** Per alias with any usage, by alias name. */
    byModel: Array<{ modelAlias: string } & PeriodAmounts>;
}

/** The filters the history and user list share (API-7, API-8). */
export interface UsageFilter {
    modelAlias?: string;
    /** Inclusive. */
    fromDate?: LocalDate;
    /** Exclusive. */
    toDate?: LocalDate;
}

export interface UserUsageListOptions extends UsageFilter {
    userIds?: string[];
    offset?: number;
    limit?: number;
}

export interface UserUsageRow extends UsageAmounts {
    userId: string;
    /** The latest local date with usage in the filter; `null` without usage. */
    lastUsageDate: LocalDate | null;
}

function amountColumns(prefix: string, filter?: SQLSyntax): SQLSyntax {
    const sum = (expression: SQLSyntax) =>
        filter
            ? sqls`COALESCE(SUM(${expression}) FILTER (WHERE ${filter}), 0)`
            : sqls`COALESCE(SUM(${expression}), 0)`;
    const as = (name: string) => SQLSyntax.createUnsafely(prefix + name);
    return sqls`${sum(USED_TOKENS)} AS ${as("tokens")},
        ${sum(sqls`u.measured_input_tokens`)} AS ${as("measured_input_tokens")},
        ${sum(sqls`u.measured_output_tokens`)} AS ${as(
        "measured_output_tokens"
    )},
        ${sum(sqls`u.estimated_tokens`)} AS ${as("estimated_tokens")},
        ${sum(sqls`u.estimated_requests`)} AS ${as("estimated_requests")}`;
}

const AMOUNT_COLUMNS = amountColumns("");

function rowToAmounts(row: any, prefix = ""): UsageAmounts {
    return {
        tokens: toSafeInteger(row[`${prefix}tokens`]),
        measuredInputTokens: toSafeInteger(
            row[`${prefix}measured_input_tokens`]
        ),
        measuredOutputTokens: toSafeInteger(
            row[`${prefix}measured_output_tokens`]
        ),
        estimatedTokens: toSafeInteger(row[`${prefix}estimated_tokens`]),
        estimatedRequests: toSafeInteger(row[`${prefix}estimated_requests`])
    };
}

export function zeroAmounts(): UsageAmounts {
    return {
        tokens: 0,
        measuredInputTokens: 0,
        measuredOutputTokens: 0,
        estimatedTokens: 0,
        estimatedRequests: 0
    };
}

function addAmounts(target: UsageAmounts, amounts: UsageAmounts) {
    for (const key of Object.keys(target) as Array<keyof UsageAmounts>) {
        target[key] += amounts[key];
        if (!Number.isSafeInteger(target[key])) {
            throw new Error("Usage total is not a safe integer");
        }
    }
}

function filterConditions(filter: UsageFilter): SQLSyntax[] {
    const conditions: SQLSyntax[] = [];
    if (filter.modelAlias !== undefined) {
        conditions.push(sqls`u.model_alias = ${filter.modelAlias}`);
    }
    if (filter.fromDate !== undefined) {
        conditions.push(sqls`u.local_date >= ${filter.fromDate}::date`);
    }
    if (filter.toDate !== undefined) {
        conditions.push(sqls`u.local_date < ${filter.toDate}::date`);
    }
    return conditions;
}

function isTokenCount(value: unknown): value is number {
    return (
        typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    );
}

export interface UsageLedgerOptions {
    /** IANA zone for local dates (USE-3, DEP-3 `usage.timeZone`). */
    timeZone?: string;
    /**
     * After a failed settlement write, the minimum interval between ledger
     * health probes made on behalf of bounded admissions.
     */
    healthProbeIntervalMs?: number;
    /** How many recent request IDs to remember, to drop duplicate settlements. */
    settledRequestMemory?: number;
}

/** The nil UUID: never a real user, used only by the health probe. */
const HEALTH_PROBE_USER = "00000000-0000-0000-0000-000000000000";
const HEALTH_PROBE_ALIAS = "__llm-services-ledger-health__";

/**
 * The usage ledger. It is the `UsageSink` the request meter settles into, and
 * it serves the reads admission and the usage pages need.
 *
 * Settlement (USE-7) is one atomic upsert per forwarded request. A request is
 * settled at most once: the meter settles once (METER-5), and the ledger also
 * drops a repeated settlement of a request ID it has already seen. A failed
 * write is never retried, because a write whose commit was lost in transit
 * would then count twice; instead it is logged as a critical accounting error
 * and **gates** bounded admission until a ledger health check passes (USE-10).
 */
export default class UsageLedger implements UsageSink {
    readonly timeZone: string;
    private readonly healthProbeIntervalMs: number;
    private readonly settledRequestMemory: number;
    private readonly settledRequestIds = new Set<string>();
    private gated = false;
    private lastProbeAt = 0;
    private probe: Promise<boolean> | null = null;

    constructor(
        private readonly pool: pg.Pool,
        options: UsageLedgerOptions = {}
    ) {
        this.timeZone = options.timeZone ?? DEFAULT_USAGE_TIME_ZONE;
        this.healthProbeIntervalMs = options.healthProbeIntervalMs ?? 5_000;
        this.settledRequestMemory = options.settledRequestMemory ?? 10_000;
    }

    /** The local date a request started at counts for (USE-3). */
    localDateOf(at: Date): LocalDate {
        return localDateOf(at, this.timeZone);
    }

    periodsAt(at: Date): UsagePeriods {
        return periodsAt(at, this.timeZone);
    }

    /** Has a settlement write failed since the last passing health check? */
    get admissionGated(): boolean {
        return this.gated;
    }

    private rememberRequest(requestId: string): boolean {
        if (this.settledRequestIds.has(requestId)) return false;
        this.settledRequestIds.add(requestId);
        if (this.settledRequestIds.size > this.settledRequestMemory) {
            // a Set iterates in insertion order: forget the oldest
            const oldest = this.settledRequestIds.values().next().value;
            if (oldest !== undefined) this.settledRequestIds.delete(oldest);
        }
        return true;
    }

    /**
     * USE-7: record one forwarded request, measured or estimated, against the
     * local date it started on. Never throws: a failure is logged (with no
     * prompts or content) and gates bounded admission.
     */
    async settle(settlement: UsageSettlement): Promise<void> {
        if (!this.rememberRequest(settlement.requestId)) {
            console.warn(
                JSON.stringify({
                    event: "llm-usage-duplicate-settlement-ignored",
                    requestId: settlement.requestId,
                    modelAlias: settlement.modelAlias
                })
            );
            return;
        }
        const measured = settlement.kind === "measured";
        const inputTokens = measured ? settlement.inputTokens : 0;
        const outputTokens = measured ? settlement.outputTokens : 0;
        const estimatedTokens = measured ? 0 : settlement.estimatedTokens;
        if (
            !isTokenCount(inputTokens) ||
            !isTokenCount(outputTokens) ||
            !isTokenCount(estimatedTokens)
        ) {
            console.error(
                JSON.stringify({
                    event: "llm-usage-invalid-settlement",
                    severity: "CRITICAL",
                    requestId: settlement.requestId,
                    userId: settlement.userId,
                    modelAlias: settlement.modelAlias,
                    kind: settlement.kind
                })
            );
            return;
        }
        const localDate = this.localDateOf(settlement.requestStartedAt);
        try {
            await this.pool.query(
                ...sqls`INSERT INTO daily_model_usage AS u
                    (user_id, model_alias, local_date,
                     measured_input_tokens, measured_output_tokens,
                     estimated_tokens, estimated_requests)
                VALUES (${settlement.userId}::uuid, ${settlement.modelAlias},
                    ${localDate}::date, ${inputTokens}, ${outputTokens},
                    ${estimatedTokens}, ${measured ? 0 : 1})
                ON CONFLICT (user_id, model_alias, local_date) DO UPDATE SET
                    measured_input_tokens = u.measured_input_tokens + EXCLUDED.measured_input_tokens,
                    measured_output_tokens = u.measured_output_tokens + EXCLUDED.measured_output_tokens,
                    estimated_tokens = u.estimated_tokens + EXCLUDED.estimated_tokens,
                    estimated_requests = u.estimated_requests + EXCLUDED.estimated_requests`.toQuery()
            );
            console.log(
                JSON.stringify({
                    event: "llm-usage-settled",
                    requestId: settlement.requestId,
                    userId: settlement.userId,
                    modelAlias: settlement.modelAlias,
                    endpoint: settlement.endpoint,
                    localDate,
                    requestStartedAt: settlement.requestStartedAt.toISOString(),
                    kind: settlement.kind,
                    inputTokens,
                    outputTokens,
                    estimatedTokens,
                    ...(settlement.kind === "estimated"
                        ? { reason: settlement.reason }
                        : {}),
                    quality: settlement.quality
                })
            );
        } catch (error) {
            this.gated = true;
            console.error(
                JSON.stringify({
                    event: "llm-usage-ledger-write-failed",
                    severity: "CRITICAL",
                    message:
                        "A usage settlement was not recorded; bounded admission is gated until the ledger is healthy",
                    requestId: settlement.requestId,
                    userId: settlement.userId,
                    modelAlias: settlement.modelAlias,
                    localDate,
                    kind: settlement.kind,
                    tokens: inputTokens + outputTokens + estimatedTokens,
                    error: error instanceof Error ? error.message : "unknown"
                })
            );
        }
    }

    /**
     * Ledger health (USE-10): can the ledger table be written? Upserts a probe
     * row inside a transaction that is always rolled back, so it never changes
     * usage. A passing check lifts the admission gate.
     */
    async checkHealth(): Promise<boolean> {
        let client: pg.PoolClient | undefined;
        try {
            client = await this.pool.connect();
            await client.query("BEGIN");
            try {
                await client.query(
                    ...sqls`INSERT INTO daily_model_usage AS u
                        (user_id, model_alias, local_date)
                    VALUES (${HEALTH_PROBE_USER}::uuid, ${HEALTH_PROBE_ALIAS}, CURRENT_DATE)
                    ON CONFLICT (user_id, model_alias, local_date)
                    DO UPDATE SET estimated_requests = u.estimated_requests`.toQuery()
                );
            } finally {
                await client.query("ROLLBACK");
            }
            if (this.gated) {
                console.log(
                    JSON.stringify({ event: "llm-usage-ledger-healthy-again" })
                );
            }
            this.gated = false;
            return true;
        } catch (error) {
            console.error(
                JSON.stringify({
                    event: "llm-usage-ledger-unhealthy",
                    error: error instanceof Error ? error.message : "unknown"
                })
            );
            return false;
        } finally {
            client?.release();
        }
    }

    /**
     * May a request bounded by a limit be admitted (USE-10)? `true` unless a
     * settlement write failed and no health check has passed since. While
     * gated, probes at most once per `healthProbeIntervalMs`, sharing one probe
     * between concurrent callers.
     */
    async readyForBoundedAdmission(): Promise<boolean> {
        if (!this.gated) return true;
        if (this.probe) return this.probe;
        if (Date.now() - this.lastProbeAt < this.healthProbeIntervalMs) {
            return false;
        }
        this.lastProbeAt = Date.now();
        this.probe = this.checkHealth().finally(() => {
            this.probe = null;
        });
        return this.probe;
    }

    /** A user's usage of one alias in the periods of a request started at `at`. */
    async periodUsage(
        userId: string,
        modelAlias: string,
        at: Date
    ): Promise<PeriodUsage> {
        const result = await this.pool.query(
            ...periodUsageSql(userId, modelAlias, this.periodsAt(at)).toQuery()
        );
        return rowToPeriodUsage(result.rows[0]);
    }

    /** All-time totals of a user, overall and per alias (DATA-6). */
    async totals(userId: string): Promise<UsageTotals> {
        const result = await this.pool.query(
            ...sqls`SELECT u.model_alias, ${AMOUNT_COLUMNS}
                FROM daily_model_usage u
                WHERE u.user_id = ${userId}::uuid
                GROUP BY u.model_alias
                ORDER BY u.model_alias`.toQuery()
        );
        const byModel = result.rows.map((row) => ({
            modelAlias: row.model_alias as string,
            ...rowToAmounts(row)
        }));
        const total: UsageAmounts = {
            tokens: 0,
            measuredInputTokens: 0,
            measuredOutputTokens: 0,
            estimatedTokens: 0,
            estimatedRequests: 0
        };
        for (const amounts of byModel) {
            for (const key of Object.keys(total) as Array<keyof UsageAmounts>) {
                total[key] += amounts[key];
            }
        }
        if (!Object.values(total).every(Number.isSafeInteger)) {
            throw new Error("Usage total is not a safe integer");
        }
        return { total, byModel };
    }

    /** A user's daily rows, newest first, paginated. */
    async dailyHistory(
        userId: string,
        options: DailyHistoryOptions = {}
    ): Promise<{ items: DailyUsageRow[]; total: number }> {
        const offset = Math.max(0, Math.floor(options.offset ?? 0));
        const limit = Math.min(
            Math.max(1, Math.floor(options.limit ?? 50)),
            500
        );
        const conditions = [
            sqls`u.user_id = ${userId}::uuid`,
            ...filterConditions(options)
        ];
        const where = SQLSyntax.where(SQLSyntax.joinWithAnd(conditions));
        const [items, count] = await Promise.all([
            this.pool.query(
                ...sqls`SELECT to_char(u.local_date, 'YYYY-MM-DD') AS local_date,
                        u.model_alias,
                        ${USED_TOKENS} AS tokens,
                        u.measured_input_tokens, u.measured_output_tokens,
                        u.estimated_tokens, u.estimated_requests
                    FROM daily_model_usage u ${where}
                    ORDER BY u.local_date DESC, u.model_alias
                    OFFSET ${offset} LIMIT ${limit}`.toQuery()
            ),
            this.pool.query(
                ...sqls`SELECT count(*)::int AS total
                    FROM daily_model_usage u ${where}`.toQuery()
            )
        ]);
        return {
            items: items.rows.map((row) => ({
                localDate: row.local_date,
                modelAlias: row.model_alias,
                ...rowToAmounts(row)
            })),
            total: count.rows[0].total
        };
    }

    /**
     * A user's usage summary as of `at` (API-7, API-8): per alias, the
     * all-time sums and the sums for the day, ISO week and calendar month of
     * `at` (USE-4), plus the same totals over every alias. One query.
     */
    async summary(userId: string, at: Date): Promise<UsageSummary> {
        const periods = this.periodsAt(at);
        const result = await this.pool.query(
            ...sqls`SELECT u.model_alias,
                    ${amountColumns("all_")},
                    ${amountColumns(
                        "day_",
                        sqls`u.local_date = ${periods.day}::date`
                    )},
                    ${amountColumns(
                        "week_",
                        sqls`u.local_date >= ${periods.weekStart}::date
                            AND u.local_date < ${periods.weekEnd}::date`
                    )},
                    ${amountColumns(
                        "month_",
                        sqls`u.local_date >= ${periods.monthStart}::date
                            AND u.local_date < ${periods.monthEnd}::date`
                    )}
                FROM daily_model_usage u
                WHERE u.user_id = ${userId}::uuid
                GROUP BY u.model_alias
                ORDER BY u.model_alias`.toQuery()
        );
        const byModel = result.rows.map((row) => ({
            modelAlias: row.model_alias as string,
            allTime: rowToAmounts(row, "all_"),
            day: rowToAmounts(row, "day_"),
            week: rowToAmounts(row, "week_"),
            month: rowToAmounts(row, "month_")
        }));
        const totals: PeriodAmounts = {
            allTime: zeroAmounts(),
            day: zeroAmounts(),
            week: zeroAmounts(),
            month: zeroAmounts()
        };
        for (const model of byModel) {
            for (const period of Object.keys(totals) as Array<
                keyof PeriodAmounts
            >) {
                addAmounts(totals[period], model[period]);
            }
        }
        return { periods, totals, byModel };
    }

    /**
     * Users with usage (API-8), with their sums over the filter, most tokens
     * first, paginated. `userIds` limits the result to those users (a user
     * search); `[]` matches nobody.
     */
    async usersWithUsage(
        options: UserUsageListOptions = {}
    ): Promise<{ items: UserUsageRow[]; total: number }> {
        const offset = Math.max(0, Math.floor(options.offset ?? 0));
        const limit = Math.min(
            Math.max(1, Math.floor(options.limit ?? 20)),
            100
        );
        const conditions = filterConditions(options);
        if (options.userIds !== undefined) {
            if (!options.userIds.length) return { items: [], total: 0 };
            conditions.push(sqls`u.user_id = ANY(${options.userIds}::uuid[])`);
        }
        const where = SQLSyntax.where(SQLSyntax.joinWithAnd(conditions));
        const [items, count] = await Promise.all([
            this.pool.query(
                ...sqls`SELECT u.user_id, ${AMOUNT_COLUMNS},
                        to_char(MAX(u.local_date), 'YYYY-MM-DD') AS last_date
                    FROM daily_model_usage u ${where}
                    GROUP BY u.user_id
                    ORDER BY tokens DESC, u.user_id
                    OFFSET ${offset} LIMIT ${limit}`.toQuery()
            ),
            this.pool.query(
                ...sqls`SELECT count(DISTINCT u.user_id)::int AS total
                    FROM daily_model_usage u ${where}`.toQuery()
            )
        ]);
        return {
            items: items.rows.map((row) => ({
                userId: row.user_id,
                lastUsageDate: row.last_date,
                ...rowToAmounts(row)
            })),
            total: count.rows[0].total
        };
    }
}
