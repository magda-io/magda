var esriPortal = libraries.esriPortal;

return {
    type: "esri-portal-resource",
    url: esriPortal.getContentItemUrl(distribution.id),
    id: esriPortal.id,
    name: esriPortal.title || esriPortal.name
};
