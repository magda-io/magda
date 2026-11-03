import {
    addDays,
    daysSinceEpoch,
    getNextShownDates,
    isFeaturedOn,
    parseLocalDateString,
    pickHighlight,
    sortHighlights,
    toLocalDateString
} from "./homeHighlightRotation";

const day = (value: string) => parseLocalDateString(value) as Date;

describe("local dates", () => {
    it("formats & parses local dates", () => {
        expect(toLocalDateString(new Date(2026, 0, 5, 23, 59))).toBe(
            "2026-01-05"
        );
        expect(toLocalDateString(day("2026-10-07"))).toBe("2026-10-07");
        expect(parseLocalDateString("2026-02-30")).toBeUndefined();
        expect(parseLocalDateString("2026-1-5")).toBeUndefined();
        expect(parseLocalDateString("")).toBeUndefined();
    });

    it("counts days since the epoch by the local date, whatever the time", () => {
        expect(daysSinceEpoch(new Date(1970, 0, 1, 0, 0))).toBe(0);
        expect(daysSinceEpoch(new Date(1970, 0, 2, 23, 59))).toBe(1);
        expect(
            daysSinceEpoch(day("2026-11-01")) -
                daysSinceEpoch(day("2026-10-31"))
        ).toBe(1);
        expect(toLocalDateString(addDays(day("2026-10-31"), 1))).toBe(
            "2026-11-01"
        );
    });
});

describe("sortHighlights", () => {
    it("sorts by order, then key; highlights with no order come last", () => {
        expect(
            sortHighlights([
                { key: "3" },
                { key: "2", order: 2 },
                { key: "1" },
                { key: "4", order: 1 },
                { key: "0", order: 2 }
            ]).map((item) => item.key)
        ).toEqual(["4", "0", "2", "1", "3"]);
    });
});

describe("pickHighlight", () => {
    const highlights = [
        { key: "c", order: 3 },
        { key: "a", order: 1 },
        { key: "b", order: 2 }
    ];

    it("returns undefined with no highlights", () => {
        expect(pickHighlight([], day("2026-10-07"))).toBeUndefined();
    });

    it("shows the highlights in turn, one per day, across month ends", () => {
        const start = day("2026-10-29");
        const picks = [0, 1, 2, 3, 4, 5, 6].map(
            (i) => pickHighlight(highlights, addDays(start, i))?.key
        );
        // each day shows the next highlight in order, including from Oct 31 to Nov 1
        const first = ["a", "b", "c"].indexOf(picks[0] as string);
        expect(picks).toEqual(
            [0, 1, 2, 3, 4, 5, 6].map((i) => ["a", "b", "c"][(first + i) % 3])
        );
    });

    it("doesn't depend on the order the highlights are listed", () => {
        const date = day("2026-10-07");
        expect(pickHighlight(highlights, date)?.key).toBe(
            pickHighlight([...highlights].reverse(), date)?.key
        );
    });

    it("shows a featured highlight until its end date, then resumes the rotation", () => {
        const featured = [
            { key: "a", order: 1 },
            { key: "b", order: 2, featuredUntil: "2026-10-08" },
            { key: "c", order: 3 }
        ];
        expect(pickHighlight(featured, day("2026-10-07"))?.key).toBe("b");
        expect(pickHighlight(featured, day("2026-10-08"))?.key).toBe("b");
        // after the end date: the normal rotation
        const next = day("2026-10-09");
        expect(pickHighlight(featured, next)?.key).toBe(
            pickHighlight(highlights, next)?.key
        );
        expect(isFeaturedOn(featured[1], day("2026-10-09"))).toBe(false);
        expect(isFeaturedOn({ key: "x", featuredUntil: "bad" }, next)).toBe(
            false
        );
    });

    it("shows the first featured highlight in order when several are featured", () => {
        expect(
            pickHighlight(
                [
                    { key: "a", order: 2, featuredUntil: "2026-12-31" },
                    { key: "b", order: 1, featuredUntil: "2026-12-31" }
                ],
                day("2026-10-07")
            )?.key
        ).toBe("b");
    });
});

describe("getNextShownDates", () => {
    it("works out the next day each highlight is shown", () => {
        const from = day("2026-10-07");
        const highlights = [
            { key: "a", order: 1 },
            { key: "b", order: 2 },
            { key: "c", order: 3, featuredUntil: "2026-10-08" }
        ];
        const dates = getNextShownDates(highlights, from);
        expect(toLocalDateString(dates["c"])).toBe("2026-10-07");
        // a & b are shown on two of the three days after the feature ends
        const after = ["2026-10-09", "2026-10-10", "2026-10-11"];
        expect(after).toContain(toLocalDateString(dates["a"]));
        expect(after).toContain(toLocalDateString(dates["b"]));
        expect(toLocalDateString(dates["a"])).not.toBe(
            toLocalDateString(dates["b"])
        );
        // each date matches the pick of that day
        for (const key of ["a", "b", "c"]) {
            expect(pickHighlight(highlights, dates[key])?.key).toBe(key);
        }
    });

    it("returns no dates with no highlights", () => {
        expect(getNextShownDates([])).toEqual({});
    });
});
