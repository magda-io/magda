package object.registry.record

# Can only be accessed by the owner
owner {
    input.object.registry.record["access-control"].ownerId = input.user.id
}
