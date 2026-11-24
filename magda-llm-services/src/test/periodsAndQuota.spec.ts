import assert from "node:assert/strict";
import {
    addDays,
    DEFAULT_USAGE_TIME_ZONE,
    localDateOf,
    parseUsageTimeZone,
    periodsAt,
    periodsOfLocalDate
} from "../usage/periods.js";
import {
    isBounded,
    profileAdmits,
    profileRemaining,
    ProfileLimits,
    remainingQuota
} from "../usage/quota.js";

const SYDNEY = "Australia/Sydney";

function limits(
    daily: number | null,
    weekly: number | null = null,
    monthly: number | null = null
): ProfileLimits {
    return {
        allowedDailyTokens: daily,
        allowedWeeklyTokens: weekly,
        allowedMonthlyTokens: monthly
    };
}

describe("accounting periods (#3838 USE-3, USE-4)", () => {
    it("defaults to Australia/Sydney and rejects invalid zones at startup", () => {
        assert.equal(DEFAULT_USAGE_TIME_ZONE, SYDNEY);
        assert.equal(parseUsageTimeZone(undefined), SYDNEY);
        assert.equal(parseUsageTimeZone(""), SYDNEY);
        assert.equal(parseUsageTimeZone("UTC"), "UTC");
        assert.equal(parseUsageTimeZone(" Europe/London "), "Europe/London");
        assert.throws(() => parseUsageTimeZone("Mars/Olympus_Mons"));
        assert.throws(() => parseUsageTimeZone("+10:00"));
    });

    it("gives the spec's example periods for 21 November 2026", () => {
        assert.deepEqual(periodsOfLocalDate("2026-11-21"), {
            day: "2026-11-21",
            weekStart: "2026-11-16",
            weekEnd: "2026-11-23",
            monthStart: "2026-11-01",
            monthEnd: "2026-12-01"
        });
    });

    it("attributes 23:59 on the last day of a month to that day and month", () => {
        // 23:59 AEDT (UTC+11) on 30 November 2026
        const at = new Date("2026-11-30T12:59:00Z");
        assert.equal(localDateOf(at, SYDNEY), "2026-11-30");
        const periods = periodsAt(at, SYDNEY);
        assert.equal(periods.monthStart, "2026-11-01");
        assert.equal(periods.monthEnd, "2026-12-01");
        // one minute later is 1 December
        assert.equal(
            localDateOf(new Date("2026-11-30T13:00:00Z"), SYDNEY),
            "2026-12-01"
        );
    });

    it("follows local midnight across the DST start (first Sunday of October)", () => {
        // Before 4 October 2026 Sydney is UTC+10, then UTC+11.
        for (const [utc, local] of [
            ["2026-10-03T13:59:59Z", "2026-10-03"],
            ["2026-10-03T14:00:00Z", "2026-10-04"],
            // 01:59 AEST, then clocks jump from 02:00 to 03:00 AEDT
            ["2026-10-03T15:59:59Z", "2026-10-04"],
            ["2026-10-03T16:00:00Z", "2026-10-04"],
            ["2026-10-04T12:59:59Z", "2026-10-04"],
            ["2026-10-04T13:00:00Z", "2026-10-05"]
        ]) {
            assert.equal(localDateOf(new Date(utc), SYDNEY), local, utc);
        }
        // 4 October 2026 is a Sunday: it ends the ISO week that began on Monday 28 September
        assert.deepEqual(periodsOfLocalDate("2026-10-04"), {
            day: "2026-10-04",
            weekStart: "2026-09-28",
            weekEnd: "2026-10-05",
            monthStart: "2026-10-01",
            monthEnd: "2026-11-01"
        });
        assert.equal(periodsOfLocalDate("2026-10-05").weekStart, "2026-10-05");
    });

    it("follows local midnight across the DST end (first Sunday of April)", () => {
        // Before 5 April 2026 Sydney is UTC+11, then UTC+10.
        for (const [utc, local] of [
            ["2026-04-04T12:59:59Z", "2026-04-04"],
            ["2026-04-04T13:00:00Z", "2026-04-05"],
            // 02:30 AEDT and, an hour later, 02:30 AEST: the same local date
            ["2026-04-04T15:30:00Z", "2026-04-05"],
            ["2026-04-04T16:30:00Z", "2026-04-05"],
            ["2026-04-05T13:59:59Z", "2026-04-05"],
            ["2026-04-05T14:00:00Z", "2026-04-06"]
        ]) {
            assert.equal(localDateOf(new Date(utc), SYDNEY), local, utc);
        }
    });

    it("handles ISO weeks across a year and leap days", () => {
        // Friday 1 January 2027
        assert.deepEqual(periodsOfLocalDate("2027-01-01"), {
            day: "2027-01-01",
            weekStart: "2026-12-28",
            weekEnd: "2027-01-04",
            monthStart: "2027-01-01",
            monthEnd: "2027-02-01"
        });
        assert.equal(periodsOfLocalDate("2028-02-29").monthEnd, "2028-03-01");
        assert.equal(addDays("2028-02-28", 1), "2028-02-29");
        assert.throws(() => periodsOfLocalDate("2027-02-29"));
        assert.throws(() => periodsOfLocalDate("21/11/2026"));
    });

    it("uses the configured zone, not the server's", () => {
        const at = new Date("2026-11-21T20:00:00Z");
        assert.equal(localDateOf(at, SYDNEY), "2026-11-22");
        assert.equal(localDateOf(at, "UTC"), "2026-11-21");
        assert.equal(localDateOf(at, "America/Los_Angeles"), "2026-11-21");
    });
});

describe("quota maths (#3838 USE-5, USE-8, DATA-3)", () => {
    const usage = { day: 60, week: 300, month: 950 };

    it("admits only below every configured limit of the same profile", () => {
        assert.equal(profileAdmits(limits(null), usage), true);
        assert.equal(profileAdmits(limits(61), usage), true);
        assert.equal(profileAdmits(limits(60), usage), false);
        assert.equal(profileAdmits(limits(1000, 1000, 950), usage), false);
        assert.equal(profileAdmits(limits(1000, 1000, 951), usage), true);
        // 0 admits no new request, even without usage
        assert.equal(
            profileAdmits(limits(0), { day: 0, week: 0, month: 0 }),
            false
        );
    });

    it("tells bounded from unlimited profiles", () => {
        assert.equal(isBounded(limits(null)), false);
        assert.equal(isBounded(limits(null, null, 0)), true);
        assert.equal(isBounded(limits(5)), true);
    });

    it("takes the minimum over one profile's periods", () => {
        assert.equal(profileRemaining(limits(null), usage), null);
        assert.equal(profileRemaining(limits(100), usage), 40);
        assert.equal(profileRemaining(limits(100, 320, 2000), usage), 20);
        assert.equal(profileRemaining(limits(10), usage), 0);
    });

    it("takes the maximum across profiles, never a sum (OR, no stacking)", () => {
        // A: 40 left today; B: 50 left this month. Not 90, and B's monthly
        // limit is never combined with A's daily one.
        assert.deepEqual(
            remainingQuota([limits(100), limits(null, null, 1000)], usage),
            { status: "limited", remainingTokens: 50 }
        );
    });

    it("reports Unlimited, Exhausted and No eligible profile distinctly", () => {
        assert.deepEqual(remainingQuota([], usage), {
            status: "no_eligible_profile"
        });
        assert.deepEqual(remainingQuota([limits(10), limits(null)], usage), {
            status: "unlimited"
        });
        assert.deepEqual(remainingQuota([limits(10), limits(0)], usage), {
            status: "exhausted",
            remainingTokens: 0
        });
    });
});
