package object.registry.aspect.partial

# Can only be accessed by the owner
owner {
    input.object.aspects["access-control"].ownerId = input.user.id
}