const { fuzzy } = libraries;

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

let isOpenData = fuzzy.findClosestFieldThreshold(dataset, 0.5, "open data");
if (isOpenData) {
    isOpenData = fuzzy.similarity(isOpenData, "yes") > 0.5;
}

let affiliatedOrganisations = fuzzy.findClosestFieldThreshold(
    dataset,
    0.5,
    "affiliated organisation"
);

if (affiliatedOrganisations) {
    affiliatedOrganisations = [affiliatedOrganisations];
}

let provenance = undefined;

if (
    mechanism !== undefined ||
    sourceSystem !== undefined ||
    likelihoodOfRelease !== undefined ||
    isOpenData !== undefined ||
    affiliatedOrganisations
) {
    provenance = {
        mechanism,
        sourceSystem,
        isOpenData,
        affiliatedOrganisationIds: affiliatedOrganisations
    };
}

return provenance;
