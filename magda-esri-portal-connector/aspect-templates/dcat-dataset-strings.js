var moment = libraries.moment;
var esriPortal = libraries.esriPortal;

// The portal item

return {
    title: dataset.title || dataset.name,

    description: dataset.description || dataset.serviceDescription,
    issued: dataset.created,
    modified: dataset.modified,
    languages: dataset.culture ? [dataset.culture] : [],
    publisher: dataset.owner,
    accrualPeriodicity: undefined,

    // Note that the portal item extent has a slightly different structure
    // compared to the extent of the associated map service
    spatial: [
        dataset.extent[0][0],
        dataset.extent[0][1],
        dataset.extent[1][0],
        dataset.extent[1][1]
    ],
    // spatial: [dataset.fullExtent.xmin, dataset.fullExtent.ymin, dataset.fullExtent.xmax, dataset.fullExtent.ymax],

    // Note that the portal item iteself doesn't have time information
    // although the associated map service does
    temporal: undefined,
    // temporal: {
    //     start: dataset.timeInfo.timeExtent[0],
    //     end: dataset.timeInfo.timeExtent[1]
    // },

    // What does this equate to?
    themes: undefined,
    // themes: (dataset.groups || []).map(group => group.title),

    keywords: dataset.tags,

    contactPoint: dataset.owner,
    landingPage: esriPortal.getDatasetLandingPageUrl(dataset.id)
};
