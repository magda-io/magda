import sortBy from "lodash/sortBy";

/**
 * Which home page highlight (background image + link) is shown on a day.
 * Shared by the home page (`reducers/contentReducer.ts`) and the highlight settings page,
 * so both always agree.
 *
 * - The highlights (only those with background images) are sorted by `order`, then by key
 *   (highlights with no `order` come last). Keys are the creation time.
 * - A highlight featured on the day (`featuredUntil` is that day or later) is shown instead of the
 *   rotation. If several are featured, the first in order is shown.
 * - Otherwise, the highlights are shown in turn, one per day:
 *   `sorted[daysSinceEpoch(day) % sorted.length]`. The day is the visitor's local date.
 */
export type HighlightCandidate = {
    // the highlight key, i.e. the last part of `home/highlights/<key>`
    key: string;
    order?: number;
    // `YYYY-MM-DD` (local date): the last day the highlight is featured
    featuredUntil?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number) {
    return n < 10 ? `0${n}` : `${n}`;
}

/** the local date of `date` as `YYYY-MM-DD` */
export function toLocalDateString(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
        date.getDate()
    )}`;
}

/** parse a `YYYY-MM-DD` string as a local date (midnight) */
export function parseLocalDateString(value: string): Date | undefined {
    if (typeof value !== "string" || !LOCAL_DATE_PATTERN.test(value)) {
        return undefined;
    }
    const [y, m, d] = value.split("-").map((item) => parseInt(item, 10));
    const date = new Date(y, m - 1, d);
    return toLocalDateString(date) === value ? date : undefined;
}

/** the number of days from 1970-01-01 to the local date of `date` */
export function daysSinceEpoch(date: Date): number {
    return Math.round(
        Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS
    );
}

/** the local date `days` days after `date` (midnight) */
export function addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function sortHighlights<T extends HighlightCandidate>(
    candidates: T[]
): T[] {
    return sortBy(candidates, [
        (item) =>
            typeof item?.order === "number" && isFinite(item.order)
                ? item.order
                : Number.MAX_SAFE_INTEGER,
        (item) => item.key
    ]);
}

export function isFeaturedOn(candidate: HighlightCandidate, date: Date) {
    return (
        typeof candidate?.featuredUntil === "string" &&
        LOCAL_DATE_PATTERN.test(candidate.featuredUntil) &&
        // `YYYY-MM-DD` strings compare in date order
        candidate.featuredUntil >= toLocalDateString(date)
    );
}

/**
 * The highlight shown on the day of `date`, or `undefined` when there are no highlights.
 * `candidates` must only include the highlights with background images.
 */
export function pickHighlight<T extends HighlightCandidate>(
    candidates: T[],
    date: Date = new Date()
): T | undefined {
    if (!candidates?.length) {
        return undefined;
    }
    const sorted = sortHighlights(candidates);
    const featured = sorted.find((item) => isFeaturedOn(item, date));
    if (featured) {
        return featured;
    }
    return sorted[daysSinceEpoch(date) % sorted.length];
}

/**
 * The next day (from the day of `from`) each highlight is shown, keyed by highlight key.
 * Highlights not shown within the next `maxDays` days are left out.
 */
export function getNextShownDates<T extends HighlightCandidate>(
    candidates: T[],
    from: Date = new Date(),
    maxDays: number = 400
): { [key: string]: Date } {
    const result: { [key: string]: Date } = {};
    if (!candidates?.length) {
        return result;
    }
    for (let i = 0; i < maxDays; i++) {
        const date = addDays(from, i);
        const picked = pickHighlight(candidates, date);
        if (picked && !result[picked.key]) {
            result[picked.key] = date;
            if (Object.keys(result).length === candidates.length) {
                break;
            }
        }
    }
    return result;
}
