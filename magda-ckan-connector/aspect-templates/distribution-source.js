var ckan = libraries.ckan;

return {
    type: "ckan-resource",
    url: ckan.getResourceShowUrl(distribution.id),
    id: ckan.id,
    name: ckan.name
};
