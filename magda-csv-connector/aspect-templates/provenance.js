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
    mechanism !== undefined ||
    sourceSystem !== undefined ||
    likelihoodOfRelease !== undefined ||
    isOpenData !== undefined ||
    affiliatedOrganisation
) {
    provenance = {
        mechanism,
        sourceSystem,
        likelihoodOfRelease,
        isOpenData,
        affiliatedOrganisationId: affiliatedOrganisation
    };
}

return provenance;
