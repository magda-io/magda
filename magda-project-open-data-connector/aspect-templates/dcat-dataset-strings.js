var parsedTemporal = dataset.temporal ? dataset.temporal.split("/") : [];

return {
    title: dataset.title,
    description: dataset.description,
    issued: dataset.issues,
    modified: dataset.modified,
    languages: dataset.language,
    publisher: dataset.publisher ? dataset.publisher.name : undefined,
    accrualPeriodicity: dataset.accrualPeriodicity,
    spatial: dataset.spatial,
    temporal: {
        start: parsedTemporal[0],
        end: parsedTemporal[1]
    },
    themes: dataset.theme,
    keywords: dataset.keyword,
    contactPoint: dataset.contactPoint ? dataset.contactPoint.fn : undefined,
    landingPage: dataset.landingPage
};
