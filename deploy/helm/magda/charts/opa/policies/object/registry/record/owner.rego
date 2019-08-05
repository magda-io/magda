package object.registry.record.partial

# Can only be accessed by the owner
owner {
    input.object.records["access-control"].ownerId = input.user.id
}
