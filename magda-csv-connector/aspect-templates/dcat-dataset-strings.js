const { fuzzy, dates } = libraries;

let title = fuzzy.findClosestField(dataset, "title", "dataset title");

let description = fuzzy.findClosestField(
    dataset,
    "description",
    "short description"
);

let issued = dates.formatDateTime(
    fuzzy.findClosestFieldThreshold(dataset, 0.5, "creation date")
);
let modified = dates.formatDateTime(
    fuzzy.findClosestFieldThreshold(dataset, 0.5, "revision date")
);

let temporal = extractTemporal();

let accrualPeriodicity = fuzzy.findClosestFieldThreshold(
    dataset,
    0.5,
    "update frequency"
);

let themes = extractKeywordList(
    fuzzy.findClosestFieldThreshold(
        dataset,
        0.5,
        "business function",
        "information classification"
    )
);

let keywords = [
    extractKeywordList(
        fuzzy.findClosestFieldThreshold(
            dataset,
            0.5,
            "tags",
            "use",
            "retention"
        )
    ),
    extractKeywordList(
        fuzzy.findClosestFieldThreshold(
            dataset,
            0.5,
            "item type",
            "content type"
        )
    ),
    extractKeywordList(
        fuzzy.findClosestFieldThreshold(
            dataset,
            0.5,
            "information classification"
        )
    )
]
    .filter(i => i)
    .reduce((a, b) => a.concat(b), []);

keywords = (keywords.length && keywords) || undefined;

let contactPoint = [
    fuzzy.findClosestFieldThreshold(
        dataset,
        0.5,
        "data steward",
        "point of contact"
    ),
    fuzzy.findClosestFieldThreshold(dataset, 0.5, "data custodian")
]
    .filter(i => i)
    .join("\n\n");

return {
    title,
    description,
    issued,
    modified,
    temporal,
    accrualPeriodicity,
    themes,
    keywords,
    contactPoint
};

function extractKeywordList(items) {
    if (items) {
        items = items.split(/\s*[;,]+\s*/g).filter(i => i);
        if (items.length > 0) {
            return items;
        }
    }
    return undefined;
}

function extractTemporal() {
    let start = dates.formatDateTime(
        fuzzy.findClosestFieldThreshold(dataset, 0.8, "start date")
    );
    let end = dates.formatDateTime(
        fuzzy.findClosestFieldThreshold(dataset, 0.8, "end date")
    );

    if (start || end) {
        return { start, end };
    }
}
