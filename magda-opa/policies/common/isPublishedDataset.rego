package common

import rego.v1

isPublishedDataset(inputObjectRefName) if {
	input.object[inputObjectRefName]["dcat-dataset-strings"]
	input.object[inputObjectRefName].publishing.state == "published"
}

# for historical reason, records without `publishing` aspect `state` field set will be considered as published dataset as well
isPublishedDataset(inputObjectRefName) if {
	input.object[inputObjectRefName]["dcat-dataset-strings"]
	not input.object[inputObjectRefName].publishing.state
}
