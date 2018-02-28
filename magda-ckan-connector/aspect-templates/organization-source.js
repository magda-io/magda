var ckan = libraries.ckan;

return {
    type: "ckan-organization",
    url: ckan.getOrganizationShowUrl(organization.id),
    id: ckan.id,
    name: ckan.name
};
