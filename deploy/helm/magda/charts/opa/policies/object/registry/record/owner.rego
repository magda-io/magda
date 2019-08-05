package object.registry.record

# Can only be accessed by the owner
owner {
    input.object.records["access-control"].ownerId = input.user.id
}
