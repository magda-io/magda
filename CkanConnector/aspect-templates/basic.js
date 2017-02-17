return {
    title: dataset.title || dataset.name,
    description: dataset.notes,
    landingPageUrl: source.getDatasetLandingPageUrl(dataset.id)
};
