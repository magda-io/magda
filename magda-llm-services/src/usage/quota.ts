// Quota maths over a user's period usage of one alias (#3838 USE-5, USE-8,
// DATA-3). Pure functions: the admission query (#3941) and the usage pages
// (#3949) both use them on rows read from SQL.

/** A profile's per-user, per-alias token limits. `null` means unlimited. */
export interface ProfileLimits {
    allowedDailyTokens: number | null;
    allowedWeeklyTokens: number | null;
    allowedMonthlyTokens: number | null;
}

/** A user's tokens used for one alias in the day, ISO week and month of a request. */
export interface PeriodUsage {
    day: number;
    week: number;
    month: number;
}

function limitPairs(
    limits: ProfileLimits,
    usage: PeriodUsage
): Array<[number, number]> {
    const pairs: Array<[number | null, number]> = [
        [limits.allowedDailyTokens, usage.day],
        [limits.allowedWeeklyTokens, usage.week],
        [limits.allowedMonthlyTokens, usage.month]
    ];
    return pairs.filter((pair): pair is [number, number] => pair[0] !== null);
}

/** Whether a profile has any limit at all (USE-10: "bounded by a limit"). */
export function isBounded(limits: ProfileLimits): boolean {
    return (
        limits.allowedDailyTokens !== null ||
        limits.allowedWeeklyTokens !== null ||
        limits.allowedMonthlyTokens !== null
    );
}

/**
 * USE-5: a profile admits a request when usage is below **every** configured
 * limit of that same profile. `0` admits nothing; `null` is unlimited.
 */
export function profileAdmits(
    limits: ProfileLimits,
    usage: PeriodUsage
): boolean {
    return limitPairs(limits, usage).every(([limit, used]) => used < limit);
}

/**
 * USE-8, for one profile: the minimum over its configured periods of
 * `max(0, limit - used)`, or `null` when it has no limit (unlimited).
 */
export function profileRemaining(
    limits: ProfileLimits,
    usage: PeriodUsage
): number | null {
    const pairs = limitPairs(limits, usage);
    if (!pairs.length) return null;
    return Math.min(...pairs.map(([limit, used]) => Math.max(0, limit - used)));
}

export type RemainingQuota =
    /** No enabled, ready profile the user can invoke covers the alias. */
    | { status: "no_eligible_profile" }
    /** At least one eligible profile has no limit. */
    | { status: "unlimited" }
    /** Every eligible profile has used up at least one of its limits. */
    | { status: "exhausted"; remainingTokens: 0 }
    | { status: "limited"; remainingTokens: number };

/**
 * USE-8: the maximum, across eligible profiles, of each profile's remaining
 * quota. Profiles combine as OR; their limits never stack (USE-5), so this is
 * never a sum. It indicates when admission stops; it isn't a promise of a
 * number of tokens.
 */
export function remainingQuota(
    profiles: ProfileLimits[],
    usage: PeriodUsage
): RemainingQuota {
    if (!profiles.length) return { status: "no_eligible_profile" };
    let best = 0;
    for (const profile of profiles) {
        const remaining = profileRemaining(profile, usage);
        if (remaining === null) return { status: "unlimited" };
        best = Math.max(best, remaining);
    }
    return best > 0
        ? { status: "limited", remainingTokens: best }
        : { status: "exhausted", remainingTokens: 0 };
}

export type PeriodName = keyof PeriodUsage;

const PERIODS: PeriodName[] = ["day", "week", "month"];

const PERIOD_LIMIT: Record<PeriodName, keyof ProfileLimits> = {
    day: "allowedDailyTokens",
    week: "allowedWeeklyTokens",
    month: "allowedMonthlyTokens"
};

/**
 * The profile that gives the overall remaining quota (USE-8): the most
 * remaining, unlimited first. When every profile is used up, the one whose
 * longest used-up period is shortest, i.e. the first to admit again.
 */
export function bestProfile<T extends ProfileLimits>(
    profiles: T[],
    usage: PeriodUsage
): T | undefined {
    const rank = (profile: T) => {
        const remaining = profileRemaining(profile, usage);
        const exhausted = PERIODS.filter((period) => {
            const limit = profile[PERIOD_LIMIT[period]];
            return limit !== null && usage[period] >= limit;
        });
        return {
            remaining: remaining === null ? Infinity : remaining,
            // 0 = day, 1 = week, 2 = month; -1 when nothing is used up
            blockedUntil: exhausted.length
                ? PERIODS.indexOf(exhausted[exhausted.length - 1])
                : -1
        };
    };
    let best: T | undefined;
    let bestRank: ReturnType<typeof rank> | undefined;
    for (const profile of profiles) {
        const current = rank(profile);
        if (
            !bestRank ||
            current.remaining > bestRank.remaining ||
            (current.remaining === bestRank.remaining &&
                current.blockedUntil < bestRank.blockedUntil)
        ) {
            best = profile;
            bestRank = current;
        }
    }
    return best;
}

/**
 * USE-8 per period, for the usage pages: each period's remaining under the
 * profile that gives the overall remaining (`bestProfile`), so the figures
 * explain the overall number and show which limit binds. A period that
 * profile doesn't limit is unlimited. Profiles combine as OR, so a
 * period-by-period maximum across profiles would not describe any limit
 * admission applies.
 */
export function periodRemainingQuota(
    profiles: ProfileLimits[],
    usage: PeriodUsage
): Record<PeriodName, RemainingQuota> {
    const best = bestProfile(profiles, usage);
    const result = {} as Record<PeriodName, RemainingQuota>;
    for (const period of PERIODS) {
        if (!best) {
            result[period] = { status: "no_eligible_profile" };
            continue;
        }
        const limit = best[PERIOD_LIMIT[period]];
        if (limit === null) {
            result[period] = { status: "unlimited" };
            continue;
        }
        const remaining = Math.max(0, limit - usage[period]);
        result[period] =
            remaining > 0
                ? { status: "limited", remainingTokens: remaining }
                : { status: "exhausted", remainingTokens: 0 };
    }
    return result;
}
