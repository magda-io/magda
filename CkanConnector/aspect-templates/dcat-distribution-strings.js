return {
    title: resource.name || resource.id,
    description: resource.description,
    issued: resource.created, // TODO: handle time zone
    modified: resource.last_modified,
    license: dataset.license_title,
    accessURL: resource.webstore_url,
    downloadURL: resource.url,
    mediaType: resource.mimetype,
    format: resource.format
};
