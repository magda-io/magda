var moment = libraries.moment;

// The map service associated with the portal item
return {
    title: distribution.name || distribution.id,
    license: undefined,
    description: distribution.description || undefined,
    issued: undefined,
    modified: undefined,
    downloadURL: undefined,
    mediaType: undefined,
    accessURL: distribution.accessURL,
    format: distribution.type || undefined
};
