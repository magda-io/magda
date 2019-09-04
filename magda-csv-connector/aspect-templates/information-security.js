const { fuzzy } = libraries;

const DLMs = {
    "LEGAL PRIVILEGE": "LEGAL PRIVILEGE",
    "LEGISLATIVE SECRECY": "LEGISLATIVE SECRECY",
    "PERSONAL PRIVACY": "PERSONAL PRIVACY"
};

const CLASSIFICATIONS = {
    UNOFFICIAL: "UNOFFICIAL",
    OFFICIAL: "OFFICIAL",
    "OFFICIAL:SENSITIVE": "OFFICIAL:SENSITIVE",
    PROTECTED: "PROTECTED",
    SECRET: "SECRET",
    "TOP SECRET": "TOP SECRET"
};

function detectOption(str, similarity = 0.2) {
    const selectedFieldData = fuzzy.findClosestFieldThreshold(
        dataset,
        similarity,
        str
    );
    if (selectedFieldData && fuzzy.similarity(selectedFieldData, "yes")) {
        return true;
    }
    return false;
}

const classificationDetectResult = Object.keys(CLASSIFICATIONS)
    .map(v => ({
        value: v,
        isDetected: detectOption(CLASSIFICATIONS[v])
    }))
    // --- the more restrictive option decides the final result. e.g. Top Secret has higher priority than Secret
    .reverse()
    .filter(item => item.isDetected === true)
    .map(item => item.value);

let classification =
    classificationDetectResult && classificationDetectResult.length
        ? classificationDetectResult[0]
        : null;

const sensitivityMarkers = Object.keys(DLMs)
    .map(v => ({
        value: v,
        isDetected: detectOption(DLMs[v], 0.5)
    }))
    // --- the more restrictive option decides the final result. e.g. Top Secret has higher priority than Secret
    .reverse()
    .filter(item => item.isDetected === true)
    .map(item => item.value);

// --- extra ad-hoc rules:
if (
    sensitivityMarkers.indexOf("PERSONAL PRIVACY") === -1 &&
    detectOption("personally identifiable information", 0.5)
) {
    sensitivityMarkers.push("PERSONAL PRIVACY");
}

if (!classification && !sensitivityMarkers.length) {
    const classificationColValue = fuzzy.findClosestFieldThreshold(
        dataset,
        0.5,
        "security classification"
    );
    if (classificationColValue) {
        if (fuzzy.similarity(classificationColValue, "OFFICIAL")) {
            classification = "OFFICIAL";
        }
    }
}

if (!classification) {
    if (sensitivityMarkers.length) {
        // --- classfication must be OFFICIAL:SENSITIVE when sensitivityMarkers is available
        return {
            disseminationLimits: sensitivityMarkers,
            classification: "OFFICIAL:SENSITIVE"
        };
    } else {
        return undefined;
    }
} else {
    // --- disseminationLimits only present when classification === "OFFICIAL:SENSITIVE"
    if (classification === "OFFICIAL:SENSITIVE" && sensitivityMarkers.length) {
        return {
            disseminationLimits: sensitivityMarkers,
            classification
        };
    } else {
        return {
            classification
        };
    }
}
