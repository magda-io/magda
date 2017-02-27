return {
    title: dataset.title || dataset.name,
    description: dataset.notes,
    issued: dataset.metadata_created, // TODO: handle time zone
    modified: dataset.metadata_modified,
    languages: dataset.language ? [dataset.language] : [],
    publisher: dataset.organization.title,
    accrualPeriodicity: dataset.update_freq,
    spatial: dataset.spatial_coverage,
    temporal: {
        start: dataset.temporal_coverage_from,
        end: dataset.temporal_coverage_to
    },
    themes: (dataset.groups || []).map(group => group.title),
    keywords: (dataset.tags || []).map(tag => tag.name),
    contactPoint: dataset.contact_point,
    landingPage: source.getDatasetLandingPageUrl(dataset.id)
};
