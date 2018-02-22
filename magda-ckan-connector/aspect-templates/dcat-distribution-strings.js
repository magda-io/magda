var moment = libraries.moment;

return {
    title: distribution.name || distribution.id,
    description: distribution.description || undefined,
    issued: distribution.created
        ? moment.utc(distribution.created).format()
        : undefined,
    modified: distribution.last_modified
        ? moment.utc(distribution.last_modified).format()
        : undefined,
    license: dataset.license_title || undefined,
    accessURL: distribution.webstore_url || undefined,
    downloadURL: distribution.url || undefined,
    mediaType:
        distribution.mimetype || distribution.mimetype_inner || undefined,
    format: distribution.format || undefined
};
