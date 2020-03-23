package object.registry.record
# Can only be accessed if not expired
esri_expiration {
    input.object.registry.record["esri-access-control"].expiration > input.timestamp
}
