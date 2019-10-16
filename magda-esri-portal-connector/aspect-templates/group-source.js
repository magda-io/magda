var esriPortal = libraries.esriPortal;

return {
    type: "esri-portal-group",
    url: esriPortal.getGroupLandingPageUrl(group.id),
    id: esriPortal.id,
    name: esriPortal.title || esriPortal.name
};
