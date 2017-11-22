var ckan = libraries.ckan;

return {
    type: 'ckan-dataset',
    url: ckan.getPackageShowUrl(dataset.id),
    name: ckan.name,
    retrievedAt: ckan.retrievedAt
};
