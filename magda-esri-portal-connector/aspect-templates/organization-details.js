const cleanOrgTitle = libraries.cleanOrgTitle;

// from the base portal info
// https://someportal/arcgis/sharing/rest/portals/self?f=pjson
const data = {
    name: organization.title,
    title: cleanOrgTitle(organization.title),
    description: organization.description,
    imageUrl: organization.portalThumbnail,
    website: `https://${organization.portalHostname}/home/index.html`
};

Object.keys(data).forEach(key => {
    if (!data[key]) delete data[key];
});

return data;
