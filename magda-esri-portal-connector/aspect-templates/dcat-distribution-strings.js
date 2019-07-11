var moment = libraries.moment;

// The map service associated with the portal item
return {
    title: distribution.name || distribution.id,

    // There is some license info at the itemInfo endpoint but it requires an additional request
    license: undefined,
    description: distribution.description || undefined,
    issued: undefined,
    modified: undefined,
    downloadURL: undefined,
    mediaType: undefined,
    // ought to be the map service url
    accessURL: undefined,
    // ought to be something like a 'map service'
    format: distribution.format || undefined
};
