package common

# a record can with publishing.state = "draft" must be a draft dataset
# input.object.record["dataset-draft"] could not exist
isDraftDataset(inputObjectRefName) {
    input.object[inputObjectRefName].publishing.state = "draft"
}