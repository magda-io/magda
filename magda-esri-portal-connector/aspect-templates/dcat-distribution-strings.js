var moment = libraries.moment;

return {
    title: distribution.name || distribution.id,
    license: undefined,
    description: distribution.description || undefined,
    issued: undefined,
    modified: undefined,
    downloadURL: undefined,
    mediaType: undefined,
    accessURL: distribution.url,
    format: distribution.type || undefined
};
