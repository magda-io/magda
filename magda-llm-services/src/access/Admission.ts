// Profile eligibility and quota admission for model requests (#3838 USE-5,
// USE-6, USE-10, MODEL-1 to MODEL-3, API-9).

import type pg from "pg";
import SQLSyntax, { sqls } from "sql-syntax";
import UsageLedger, {
    periodUsageSql,
    rowToPeriodUsage
} from "../usage/UsageLedger.js";
import {
    isBounded,
    PeriodUsage,
    profileAdmits,
    ProfileLimits,
    remainingQuota,
    RemainingQuota
} from "../usage/quota.js";
import { Caller } from "./CallerAccess.js";
import ServedModels, { wildcardAliases } from "./ServedModels.js";

export const WILDCARD_MODELS = "*";

export interface EligibleProfile extends ProfileLimits {
    id: string;
}

export type AdmissionResult =
    | {
          status: "admitted";
          /** `null` for an administrator: no profile, no quota (AUTH-10). */
          profileIds: string[] | null;
      }
    /** No enabled, ready profile the caller may invoke covers the alias (`403`). */
    | { status: "no_eligible_profile" }
    /** Every eligible profile has used up a limit (`429 llm_quota_exceeded`). */
    | { status: "quota_exceeded"; remaining: RemainingQuota }
    /** The ledger can't be read, or is gated after a failed write (`503`, USE-10). */
    | { status: "ledger_unavailable" };

export interface AdmissionOptions {
    pool?: pg.Pool;
    ledger?: UsageLedger;
    /** MODEL-1: the deployment allowlist, an outer bound for everyone. */
    allowedModels: ReadonlySet<string>;
    servedModels: ServedModels;
}

function toLimit(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    if (!Number.isSafeInteger(n)) {
        throw new Error(`Profile limit ${value} is not a safe integer`);
    }
    return n;
}

function eligibilityConditions(condition: SQLSyntax): SQLSyntax[] {
    return [
        sqls`p.enabled = TRUE`,
        // the translated partial decision (EVAL-1); empty = every profile
        ...(condition.isEmpty ? [] : [sqls`(${condition})`])
    ];
}

/**
 * Decides whether a caller may send a model request, and which aliases they
 * may discover.
 *
 * Eligible profiles are `enabled`, cover the alias (an
 * explicit alias, or `["*"]` over aliases that are both allowed and served,
 * MODEL-2) and satisfy the caller's translated partial decision (EVAL-1).
 */
export default class Admission {
    constructor(private readonly options: AdmissionOptions) {}

    private async wildcardCovers(alias: string): Promise<boolean> {
        const served = await this.options.servedModels.served();
        return wildcardAliases(this.options.allowedModels, served).includes(
            alias
        );
    }

    /**
     * The profiles eligible for `alias` and the user's usage of that alias
     * in the periods of a request started at `at`, read in **one** SQL query
     * (USE-6). Throws when the database can't be read.
     */
    async eligibility(
        caller: Caller,
        alias: string,
        at: Date
    ): Promise<{ profiles: EligibleProfile[]; usage: PeriodUsage }> {
        const { pool, ledger, allowedModels } = this.options;
        const access = caller.access;
        if (access.kind !== "profiles" || !allowedModels.has(alias)) {
            return { profiles: [], usage: { day: 0, week: 0, month: 0 } };
        }
        if (!pool || !ledger) {
            throw new Error("The LLM Services database is not configured");
        }
        const where = SQLSyntax.where(
            SQLSyntax.joinWithAnd([
                ...eligibilityConditions(access.condition),
                sqls`(${alias} = ANY(p.allowed_models)
                    OR p.allowed_models = ARRAY[${WILDCARD_MODELS}]::TEXT[])`
            ])
        );
        const result = await pool.query(
            ...sqls`SELECT period_usage.day_used, period_usage.week_used,
                    period_usage.month_used,
                    p.id, p.allowed_daily_tokens, p.allowed_weekly_tokens,
                    p.allowed_monthly_tokens,
                    (${alias} = ANY(p.allowed_models)) AS explicit
                FROM (${periodUsageSql(
                    caller.userId,
                    alias,
                    ledger.periodsAt(at)
                )}) period_usage
                CROSS JOIN access_profiles p
                ${where}
                ORDER BY p.id`.toQuery()
        );
        let usage: PeriodUsage = { day: 0, week: 0, month: 0 };
        let wildcard: boolean | undefined;
        const profiles: EligibleProfile[] = [];
        for (const row of result.rows) {
            usage = rowToPeriodUsage(row);
            if (!row.explicit) {
                // covered only by `*`: is the alias served (MODEL-2)?
                if (wildcard === undefined) {
                    wildcard = await this.wildcardCovers(alias);
                }
                if (!wildcard) continue;
            }
            profiles.push({
                id: row.id,
                allowedDailyTokens: toLimit(row.allowed_daily_tokens),
                allowedWeeklyTokens: toLimit(row.allowed_weekly_tokens),
                allowedMonthlyTokens: toLimit(row.allowed_monthly_tokens)
            });
        }
        return { profiles, usage };
    }

    /**
     * Admit a request for `alias`, started at `at` (USE-3: the same instant
     * settles it). The alias must already be deployment-allowed (MODEL-1).
     */
    async admit(
        caller: Caller,
        alias: string,
        at: Date
    ): Promise<AdmissionResult> {
        if (!this.options.allowedModels.has(alias)) {
            return { status: "no_eligible_profile" };
        }
        if (caller.access.kind === "admin") {
            // AUTH-10 / USE-9: no profile, no quota; still settled
            return { status: "admitted", profileIds: null };
        }
        if (caller.access.kind === "none") {
            return { status: "no_eligible_profile" };
        }
        let eligible;
        try {
            eligible = await this.eligibility(caller, alias, at);
        } catch (error) {
            console.error(
                JSON.stringify({
                    event: "llm-admission-ledger-read-failed",
                    modelAlias: alias,
                    error: error instanceof Error ? error.message : "unknown"
                })
            );
            return { status: "ledger_unavailable" };
        }
        const { profiles, usage } = eligible;
        if (!profiles.length) return { status: "no_eligible_profile" };

        const ledger = this.options.ledger!;
        if (!(await ledger.readyForBoundedAdmission())) {
            // USE-10: a settlement write failed and the ledger hasn't passed a
            // health check since. Only profiles without any limit still admit.
            const unbounded = profiles.filter((p) => !isBounded(p));
            return unbounded.length
                ? { status: "admitted", profileIds: unbounded.map((p) => p.id) }
                : { status: "ledger_unavailable" };
        }
        // USE-5: OR across profiles; each profile against its own limits only
        const admitting = profiles.filter((p) => profileAdmits(p, usage));
        if (admitting.length) {
            return {
                status: "admitted",
                profileIds: admitting.map((p) => p.id)
            };
        }
        return {
            status: "quota_exceeded",
            remaining: remainingQuota(profiles, usage)
        };
    }

    /**
     * API-9: the allowed aliases covered by at least one profile the caller
     * may invoke, whether or not its quota is used up. Administrators see
     * every allowed alias. In allowlist order. Throws when the database can't
     * be read.
     */
    async invocableModels(caller: Caller): Promise<string[]> {
        const { pool, allowedModels } = this.options;
        const access = caller.access;
        if (access.kind === "admin") return [...allowedModels];
        if (access.kind === "none") return [];
        if (!pool) {
            throw new Error("The LLM Services database is not configured");
        }
        const where = SQLSyntax.where(
            SQLSyntax.joinWithAnd(eligibilityConditions(access.condition))
        );
        const result = await pool.query(
            ...sqls`SELECT DISTINCT unnest(p.allowed_models) AS alias
                FROM access_profiles p ${where}`.toQuery()
        );
        const covered = new Set<string>();
        for (const row of result.rows) {
            if (row.alias === WILDCARD_MODELS) {
                const served = await this.options.servedModels.served();
                for (const alias of wildcardAliases(allowedModels, served)) {
                    covered.add(alias);
                }
            } else if (allowedModels.has(row.alias)) {
                covered.add(row.alias);
            }
        }
        return [...allowedModels].filter((alias) => covered.has(alias));
    }
}
