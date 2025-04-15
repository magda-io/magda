package common

import rego.v1

# a record can with publishing.state = "draft" must be a draft distribution
isDraftDistribution(inputObjectRefName) if {
	input.object[inputObjectRefName].publishing.state == "draft"
}
