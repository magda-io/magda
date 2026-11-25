// Accounting periods for the usage ledger (#3838 USE-3, USE-4).
//
// A request is attributed to the local date, in the configured IANA time zone,
// on which it **started**. Weeks (ISO, Monday start) and calendar months are
// half-open ranges of local dates, computed with calendar arithmetic on the
// date itself, never with fixed UTC offsets, so DST transitions can't move a
// boundary.

export const DEFAULT_USAGE_TIME_ZONE = "Australia/Sydney";

/** A local calendar date, `YYYY-MM-DD`. */
export type LocalDate = string;

export interface UsagePeriods {
    /** The request's local date. */
    day: LocalDate;
    /** ISO week: `weekStart <= local_date < weekEnd`. */
    weekStart: LocalDate;
    weekEnd: LocalDate;
    /** Calendar month: `monthStart <= local_date < monthEnd`. */
    monthStart: LocalDate;
    monthEnd: LocalDate;
}

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
    let formatter = formatters.get(timeZone);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat("en-US", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        });
        formatters.set(timeZone, formatter);
    }
    return formatter;
}

/**
 * Validate an IANA time zone name (DEP-3 `usage.timeZone`), at startup.
 * Returns the zone name.
 */
export function parseUsageTimeZone(value: string | undefined): string {
    const timeZone = value?.trim() || DEFAULT_USAGE_TIME_ZONE;
    try {
        // a raw UTC offset isn't an IANA zone, and can't follow DST (USE-3)
        if (/^[+-]\d/.test(timeZone)) throw new Error("offset");
        formatterFor(timeZone);
    } catch {
        throw new Error(
            `USAGE_TIME_ZONE must be a valid IANA time zone, got ${JSON.stringify(
                timeZone
            )}`
        );
    }
    return timeZone;
}

/** The local date of `at` in `timeZone` (USE-3). */
export function localDateOf(at: Date, timeZone: string): LocalDate {
    const parts = formatterFor(timeZone).formatToParts(at);
    const part = (type: string) =>
        parts.find((item) => item.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
}

function parseLocalDate(date: LocalDate): Date {
    const match = LOCAL_DATE_PATTERN.exec(date);
    if (!match) {
        throw new Error(`Invalid local date ${JSON.stringify(date)}`);
    }
    const value = new Date(
        Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    );
    if (value.toISOString().slice(0, 10) !== date) {
        throw new Error(`Invalid local date ${JSON.stringify(date)}`);
    }
    return value;
}

function format(date: Date): LocalDate {
    return date.toISOString().slice(0, 10);
}

/** Calendar arithmetic on a local date: `days` may be negative. */
export function addDays(date: LocalDate, days: number): LocalDate {
    const value = parseLocalDate(date);
    value.setUTCDate(value.getUTCDate() + days);
    return format(value);
}

export function isLocalDate(value: unknown): value is LocalDate {
    if (typeof value !== "string") return false;
    try {
        parseLocalDate(value);
        return true;
    } catch {
        return false;
    }
}

/** The day, ISO week and calendar month containing a local date (USE-4). */
export function periodsOfLocalDate(day: LocalDate): UsagePeriods {
    const date = parseLocalDate(day);
    // getUTCDay: 0 = Sunday; ISO weeks start on Monday
    const sinceMonday = (date.getUTCDay() + 6) % 7;
    const weekStart = addDays(day, -sinceMonday);
    const monthStart = format(
        new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    );
    const monthEnd = format(
        new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
    );
    return {
        day,
        weekStart,
        weekEnd: addDays(weekStart, 7),
        monthStart,
        monthEnd
    };
}

/** The periods a request started at `at` counts towards (USE-3, USE-4). */
export function periodsAt(at: Date, timeZone: string): UsagePeriods {
    return periodsOfLocalDate(localDateOf(at, timeZone));
}
