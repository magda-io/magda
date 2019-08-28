const { fuzzy } = libraries;

let disseminationLimits = [];

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

function detectOption(str) {
    const selectedFieldData = fuzzy.findClosestFieldThreshold(
        dataset,
        0.2,
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

const sensitivityMarkerDetectResult = Object.keys(DLMs)
    .map(v => ({
        value: v,
        isDetected: detectOption(DLMs[v])
    }))
    // --- the more restrictive option decides the final result. e.g. Top Secret has higher priority than Secret
    .reverse()
    .filter(item => item.isDetected === true)
    .map(item => item.value);

let sensitivityMarker =
    sensitivityMarkerDetectResult && sensitivityMarkerDetectResult.length
        ? sensitivityMarkerDetectResult[0]
        : null;

// --- extra ad-hoc rules:
if (sensitivityMarker) {
    if (detectOption("personally identifiable information"))
        sensitivityMarker = "PERSONAL PRIVACY";
}
if (!classification && !sensitivityMarker) {
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
    if (sensitivityMarker) {
        // --- classfication must be OFFICIAL:SENSITIVE when sensitivityMarker is available
        return {
            disseminationLimits: sensitivityMarker,
            classification: "OFFICIAL:SENSITIVE"
        };
    } else {
        return undefined;
    }
} else {
    // --- disseminationLimits only present when classification === "OFFICIAL:SENSITIVE"
    if (classification === "OFFICIAL:SENSITIVE" && sensitivityMarker) {
        return {
            disseminationLimits: sensitivityMarker,
            classification
        };
    } else {
        return {
            classification
        };
    }
}
