var ckan = libraries.ckan;

return {
    type: "ckan-dataset",
    url: ckan.getPackageShowUrl(dataset.id),
    id: ckan.id,
    name: ckan.name
};
