const moment = libraries.moment;

// from moment.js, from-string.js
var tzRegex = /Z|[+-]\d\d(?::?\d\d)?/;
var isoTimes = [
    ["HH:mm:ss.SSSS", /\d\d:\d\d:\d\d\.\d+/],
    ["HH:mm:ss,SSSS", /\d\d:\d\d:\d\d,\d+/],
    ["HH:mm:ss", /\d\d:\d\d:\d\d/],
    ["HH:mm", /\d\d:\d\d/],
    ["HHmmss.SSSS", /\d\d\d\d\d\d\.\d+/],
    ["HHmmss,SSSS", /\d\d\d\d\d\d,\d+/],
    ["HHmmss", /\d\d\d\d\d\d/],
    ["HHmm", /\d\d\d\d/],
    ["HH", /\d\d/]
];

for (var i = 0; i < isoTimes.length; ++i) {
    // A time must follow whitespace or 'T' and occur at the end of the string.
    isoTimes[i][1] = new RegExp(
        "[\\sT]" + isoTimes[i][1].source + "(" + tzRegex.source + ")?$"
    );
}

const customDateFormats = [
    "DD-MM-YYYY",
    "DD-MMM-YYYY",
    "DD-MMMM-YYYY",
    "D-MMM-YYYY",
    "D-MMMM-YYYY",
    "MM-DD-YYYY",
    "MMM-DD-YYYY",
    "MMMM-DD-YYYY",
    "MMM-DD-YY",
    "MMMM-DD-YY",
    "MMMM-YYYY",
    "MMM-YYYY",
    "MMMM-YY",
    "MMM-YY",
    "YYYY",
    "YY"
];

const customDateFormatRegexs = customDateFormats.map(format => {
    return {
        format: format,
        regex: new RegExp(
            "^" +
                format
                    .replace(/-/g, "[-\\/\\s]")
                    .replace(/M{4}/g, "[A-Za-z]+")
                    .replace(/M{3}/g, "[A-Za-z]{3}")
                    .replace(/[DMY]/g, "\\d")
        )
    };
});

const dateComponentSeparators = ["-", "/", " "];
const dateTimeSeparators = ["T", " "];
const formatScratch = [];

function parseDateTimeString(s) {
    if (!s) {
        return moment.invalid();
    }

    // First try parsing this as an ISO8601 date/time
    const iso = moment.utc(s, moment.ISO_8601, true);
    if (iso.isValid()) {
        return iso;
    }

    // Next try some custom date formats
    const matchingDateFormats = customDateFormatRegexs.filter(format =>
        format.regex.test(s)
    );
    const matchingTimeFormats = isoTimes.filter(format => format[1].test(s));
    const includeTimeZone = tzRegex.test(s);

    let formats = formatScratch;
    formats.length = 0;

    matchingDateFormats.forEach(dateFormat => {
        dateComponentSeparators.forEach(dateComponentSeparator => {
            const dateFormatWithSeparator = dateFormat.format.replace(
                /-/g,
                dateComponentSeparator
            );
            formats.push(dateFormatWithSeparator);

            dateTimeSeparators.forEach(dateTimeSeparator => {
                matchingTimeFormats.forEach(timeFormat => {
                    formats.push(
                        dateFormatWithSeparator +
                            dateTimeSeparator +
                            timeFormat[0]
                    );

                    if (includeTimeZone) {
                        formats.push(
                            dateFormatWithSeparator +
                                dateTimeSeparator +
                                timeFormat[0] +
                                "Z"
                        );
                    }
                });
            });
        });
    });

    return moment.utc(s, formats, true);
}

const oneMillisecond = moment.duration(1);

function getPrecisionFromMoment(m) {
    const format = m.creationData().format;

    // The most precise token in the format indicates the precision
    if (/S/.test(format)) {
        return oneMillisecond;
    } else if (/s/.test(format)) {
        return moment.duration(1, "seconds");
    } else if (/m/.test(format)) {
        return moment.duration(1, "minutes");
    } else if (/[hH]/.test(format)) {
        return moment.duration(1, "hours");
    } else if (/[DdE]/.test(format)) {
        return moment.duration(1, "days");
    } else if (/[WwG]/.test(format)) {
        return moment.duration(1, "weeks");
    } else if (/M/.test(format)) {
        return moment.duration(1, "months");
    } else if (/Q/.test(format)) {
        return moment.duration(1, "quarters");
    } else if (/[YgG]/.test(format)) {
        return moment.duration(1, "years");
    } else {
        return moment.duration(0);
    }
}

function roundUp(date) {
    const precision = getPrecisionFromMoment(date);
    return moment
        .utc(date)
        .add(precision)
        .subtract(oneMillisecond);
}

const nowRegExp = /^(Current|Now|Ongoing)$/i;

function parseTemporalCoverageField(raw, now, shouldRoundUp) {
    if (nowRegExp.test(raw)) {
        return now;
    } else {
        const parsed = parseDateTimeString(raw);
        if (parsed.isValid()) {
            if (shouldRoundUp) {
                roundUp(parsed);
            }
            return parsed;
        } else {
            return undefined;
        }
    }
}

function parse(start, end, modified) {
    const startDate = parseTemporalCoverageField(start, modified, false);
    const endDate = parseTemporalCoverageField(end, modified, true);

    let result =
        startDate && endDate
            ? {
                  start: startDate,
                  end: endDate
              }
            : undefined;

    if (start && end && !startDate && !endDate) {
        // Unparsable text in both start and end - this might mean that there's split values in both (e.g. start=1999-2000, end=2010-2011).
        // In this case we split each and take the earlier value for start and later value for end.
        const startSplit = trySplit(start, modified);
        const endSplit = trySplit(end, modified);

        if (startSplit && endSplit) {
            result = {
                start: moment.min(startSplit.start, endSplit.start),
                end: moment.max(startSplit.end, endSplit.end)
            };
        }
    } else if (start && !end) {
        result = trySplit(start, modified) || result;
    } else if (!start && end) {
        result = trySplit(end, modified) || result;
    }

    return result;
}

function trySplit(raw, modified) {
    const parts = raw.split(/\s*(?:to|-)\s*/i);
    if (parts.length !== 2) {
        return undefined;
    }

    const first = parseTemporalCoverageField(parts[0], modified, false);
    const second = parseTemporalCoverageField(parts[1], modified, false);

    if (!first || !second) {
        return undefined;
    }

    return {
        start: moment.min(first, second),
        end: roundUp(moment.max(first, second))
    };
}

return {
    parse
};
