package common

isPublishedDistribution(inputObjectRefName) {
    input.object[inputObjectRefName]["dcat-distribution-strings"]
    input.object[inputObjectRefName].publishing.state = "published"
}

# for historical reason, records without `publishing` aspect `state` field set will be considered as published distribution as well
isPublishedDistribution(inputObjectRefName) {
    input.object[inputObjectRefName]["dcat-distribution-strings"]
    not input.object[inputObjectRefName].publishing.state
}
