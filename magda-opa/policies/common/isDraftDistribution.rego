package common

# a record can with publishing.state = "draft" must be a draft distribution
isDraftDistribution(inputObjectRefName) {
    input.object[inputObjectRefName].publishing.state = "draft"
}