var moment = libraries.moment;
var esriPortal = libraries.esriPortal;

// The portal item

const dsExtent =
    dataset.extent.length > 0
        ? `${dataset.extent[0][0]}, ${dataset.extent[0][1]}, ${dataset.extent[1][0]}, ${dataset.extent[1][1]}`
        : undefined;

return {
    title: dataset.title || dataset.name,
    description: dataset.description,
    issued: moment.utc(dataset.created).format(),
    modified: moment.utc(dataset.created).format(),
    languages: dataset.culture ? [dataset.culture] : [],
    publisher: dataset.owner,
    accrualPeriodicity: undefined,
    spatial: dsExtent,
    temporal: undefined,

    // What does this equate to?
    themes: undefined,
    keywords: dataset.tags,
    contactPoint: dataset.owner,
    landingPage: esriPortal.getDatasetLandingPageUrl(dataset.id)
};
