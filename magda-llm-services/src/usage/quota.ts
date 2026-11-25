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
