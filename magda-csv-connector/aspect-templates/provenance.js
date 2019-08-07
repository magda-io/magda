const { fuzzy } = libraries;

let isInternallyProduced = fuzzy.findClosestFieldThreshold(
    dataset,
    0.5,
    "created internally"
);
if (isInternallyProduced) {
    isInternallyProduced = fuzzy.similarity(isInternallyProduced, "yes") > 0.5;
}

let mechanism = fuzzy.findClosestFieldThreshold(
    dataset,
    0.5,
    "primary source",
    "additional information"
);

let sourceSystem = fuzzy.findClosestFieldThreshold(
    dataset,
    0.5,
    "source system",
    "primary source"
);

let likelihoodOfRelease = fuzzy.findClosestFieldThreshold(
    dataset,
    0.5,
    "likelihood of release"
);

let isOpenData = fuzzy.findClosestFieldThreshold(dataset, 0.5, "open data");
if (isOpenData) {
    isOpenData = fuzzy.similarity(isOpenData, "yes") > 0.5;
}

let affiliatedOrganisation = fuzzy.findClosestFieldThreshold(
    dataset,
    0.5,
    "affiliated organisation"
);

if (affiliatedOrganisation) {
    affiliatedOrganisation = [affiliatedOrganisation];
}

let provenance = undefined;

if (
    isInternallyProduced !== undefined ||
    mechanism !== undefined ||
    sourceSystem !== undefined ||
    likelihoodOfRelease !== undefined ||
    isOpenData !== undefined ||
    affiliatedOrganisation
) {
    provenance = {
        isInternallyProduced,
        mechanism,
        sourceSystem,
        likelihoodOfRelease,
        isOpenData,
        affiliatedOrganisation
    };
}

return provenance;
