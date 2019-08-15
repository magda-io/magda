const { fuzzy } = libraries;

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
