package common

isPublishedDataset(inputObjectRefName) {
    input.object[inputObjectRefName]["dcat-dataset-strings"]
    input.object[inputObjectRefName].publishing.state = "published"
}

# for historical reason, records without `publishing` aspect `state` field set will be considered as published dataset as well
isPublishedDataset(inputObjectRefName) {
    input.object[inputObjectRefName]["dcat-dataset-strings"]
    not input.object[inputObjectRefName].publishing.state
}
