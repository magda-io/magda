var moment = libraries.moment;
return {
    title: distribution.name || distribution.id,
    license: distribution.licence || undefined,
    accessURL: distribution.accessURL || undefined,
    downloadURL: distribution.downloadURL || undefined,
    mediaType: distribution.mediaType || undefined,
    format: distribution.format || undefined,
    description: distribution.description || undefined,
    issued: "",
    modified: distribution.lastUpdated
        ? moment
              .unix(distribution.lastUpdated)
              .utc()
              .format()
        : undefined
};
