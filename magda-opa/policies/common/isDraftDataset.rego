package common

import rego.v1

# a record can with publishing.state = "draft" must be a draft dataset
# input.object.record["dataset-draft"] could not exist
isDraftDataset(inputObjectRefName) if {
	input.object[inputObjectRefName].publishing.state == "draft"
}
