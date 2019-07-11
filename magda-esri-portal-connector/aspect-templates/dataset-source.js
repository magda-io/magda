var esriPortal = libraries.esriPortal;

return {
    type: "esri-portal-dataset",
    url: esriPortal.getContentItemUrl(dataset.id),
    id: esriPortal.id,
    name: esriPortal.title || esriPortal.name
};
