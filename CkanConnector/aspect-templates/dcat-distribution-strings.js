var moment = libraries.moment;

return {
    title: resource.name || resource.id,
    description: resource.description || undefined,
    issued: resource.created ? moment.utc(resource.created).format() : undefined,
    modified: resource.last_modified ? moment.utc(resource.last_modified).format() : undefined,
    license: dataset.license_title || undefined,
    accessURL: resource.webstore_url || undefined,
    downloadURL: resource.url || undefined,
    mediaType: resource.mimetype || resource.mimetype_inner || undefined,
    format: resource.format || undefined
};
