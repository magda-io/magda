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

let conformsTo = fuzzy.findClosestFieldThreshold(dataset, 0.5, "data standard");

let accessLevel = fuzzy.findClosestFieldThreshold(
    dataset,
    0.5,
    "dataset value",
    "access"
);

let importance = fuzzy.findClosestFieldThreshold(dataset, 0.5, "importance");

let status = fuzzy.findClosestFieldThreshold(dataset, 0.5, "status");

let informationSecurity = extractInformationSecurity();

let metadata = extractMetadata();

return {
    title,
    description,
    issued,
    modified,
    temporal,
    accrualPeriodicity,
    themes,
    keywords,
    contactPoint,
    accessLevel,
    importance,
    status,
    informationSecurity,
    metadata
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

function extractInformationSecurity() {
    let disseminationLimits = [];

    const DLMs = {
        "For Official Use Only": "For Official Use Only",
        Sensitive: "For Official Use Only",
        "Sensitive: Personal": "Sensitive: Personal",
        "Sensitive: Legal": "Sensitive: Legal",
        "Sensitive: Cabinet": "Sensitive: Cabinet"
    };

    const CLASSIFICATIONS = {
        UNCLASSIFIED: "UNCLASSIFIED",
        PROTECTED: "PROTECTED",
        CONFIDENTIAL: "CONFIDENTIAL",
        SECRET: "SECRET",
        "TOP SECRET": "TOP SECRET"
    };

    let isSensitiveData = fuzzy.findClosestFieldThreshold(
        dataset,
        0.5,
        "sensitive data"
    );
    if (isSensitiveData && fuzzy.similarity(isSensitiveData, "yes")) {
        disseminationLimits.push("Sensitive");
    }

    let isSensitivePersonalData = fuzzy.findClosestFieldThreshold(
        dataset,
        0.5,
        "personally identifiable information"
    );
    if (
        isSensitivePersonalData &&
        fuzzy.similarity(isSensitivePersonalData, "yes")
    ) {
        disseminationLimits.push("Sensitive: Personal");
    }

    let isSensitiveCommercialData = fuzzy.findClosestFieldThreshold(
        dataset,
        0.5,
        "potentially commercially sensitive"
    );
    if (
        isSensitiveCommercialData &&
        fuzzy.similarity(isSensitiveCommercialData, "yes")
    ) {
        disseminationLimits.push("Sensitive: Commercial");
    }

    let classification = fuzzy.findClosestFieldThreshold(
        dataset,
        0.5,
        "security classification"
    );

    if (classification) {
        let DLM = fuzzy.findClosestFieldThreshold(DLMs, 0.5, classification);
        if (DLM) {
            disseminationLimits.push(DLM);
        }
        classification = fuzzy.findClosestFieldThreshold(
            CLASSIFICATIONS,
            0.5,
            classification
        );
    }

    disseminationLimits =
        (disseminationLimits.length && disseminationLimits) || undefined;

    if (classification || disseminationLimits) {
        return {
            disseminationLimits,
            classification
        };
    }
}

function extractMetadata() {
    // lets use a higher threshold as this could easily be confused with "data format" etc
    let format = fuzzy.findClosestFieldThreshold(
        dataset,
        0.9,
        "metadata format"
    );

    let standard = fuzzy.findClosestFieldThreshold(
        dataset,
        0.9,
        "metadata standard"
    );

    let location = fuzzy.findClosestFieldThreshold(
        dataset,
        0.9,
        "metadata location"
    );

    if (format || standard || location) {
        return {
            format,
            standard,
            location
        };
    }
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
