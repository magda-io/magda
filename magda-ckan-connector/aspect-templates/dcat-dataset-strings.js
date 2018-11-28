var moment = libraries.moment;
var ckan = libraries.ckan;

return {
    title: dataset.title || dataset.name,
    description: dataset.notes,
    issued: dataset.metadata_created
        ? moment.utc(dataset.metadata_created).format()
        : undefined,
    modified: dataset.metadata_modified
        ? moment.utc(dataset.metadata_modified).format()
        : undefined,
    languages: dataset.language ? [dataset.language] : [],
    publisher: (dataset.organization || {}).title,
    accrualPeriodicity: dataset.update_freq,
    spatial: dataset.spatial_coverage || dataset.spatial,
    temporal: {
        start: dataset.temporal_coverage_from,
        end: dataset.temporal_coverage_to
    },
    themes: (dataset.groups || []).map(group => group.title),
    keywords: (dataset.tags || []).map(tag => tag.name),
    contactPoint: dataset.contact_point,
    landingPage: ckan.getDatasetLandingPageUrl(dataset.id)
};
