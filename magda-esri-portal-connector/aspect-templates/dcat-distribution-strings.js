var moment = libraries.moment;
var esriPortal = libraries.esriPortal;
var URI = libraries.URI;

var accessURL;
var downloadURL;

if (distribution.url) {
    accessURL = distribution.url;
} else {
    downloadURL = new URI(esriPortal.getContentItemUrl(distribution.id))
        .segment("data")
        .toString();
}

return {
    title: distribution.name || distribution.id,
    license: undefined,
    description: undefined,
    issued: undefined,
    modified: undefined,
    downloadURL: downloadURL,
    mediaType: undefined,
    accessURL: accessURL,
    format: distribution.type || undefined
};
