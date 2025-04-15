package common

import rego.v1

isPublishedDistribution(inputObjectRefName) if {
	input.object[inputObjectRefName]["dcat-distribution-strings"]
	input.object[inputObjectRefName].publishing.state == "published"
}

# for historical reason, records without `publishing` aspect `state` field set will be considered as published distribution as well
isPublishedDistribution(inputObjectRefName) if {
	input.object[inputObjectRefName]["dcat-distribution-strings"]
	not input.object[inputObjectRefName].publishing.state
}
