package common

import rego.v1

verifyPublishingStatus(inputObjectRefName, expectedStatus) if {
	expectedStatus == "published"
	input.object[inputObjectRefName].publishing.state == "published"
}

# for historical reason, some published dataset might not have `publishing` aspect
verifyPublishingStatus(inputObjectRefName, expectedStatus) if {
	expectedStatus == "published"
	not input.object[inputObjectRefName].publishing.state
}

verifyPublishingStatus(inputObjectRefName, expectedStatus) if {
	expectedStatus != "published"
	input.object[inputObjectRefName].publishing.state == expectedStatus
}
