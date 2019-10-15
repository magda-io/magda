var esriPortal = libraries.esriPortal;

return {
    type: "esri-portal-organization",
    url: esriPortal.getOrganizationShowUrl(organization.id),
    id: esriPortal.id,
    name: esriPortal.title
};
