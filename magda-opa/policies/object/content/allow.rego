package object.content

import rego.v1

import data.common.hasNoConstraintPermission
import data.object.dataset.hasAnyDraftReadPermission
import data.object.dataset.hasAnyPublishedReadPermission

default allow := false

# handle all operations except "read"
allow if {
	input.operationUri != "object/content/read"
	hasNoConstraintPermission(input.operationUri)
}

# handle "read" operation for `header/navigation/drafts`
# the legacy rule is created for backward compatibility
allow if {
	input.operationUri == "object/content/read"
	hasNoConstraintPermission(input.operationUri)
	input.object.content.id == "header/navigation/drafts"
	hasAnyDraftReadPermission
}

# handle "read" operation for `header/navigation/datasets`
# the legacy rule is created for backward compatibility
allow if {
	input.operationUri == "object/content/read"
	hasNoConstraintPermission(input.operationUri)
	input.object.content.id == "header/navigation/datasets"
	hasAnyPublishedReadPermission
}

# handle "read" operation for any other cases
allow if {
	input.operationUri == "object/content/read"
	hasNoConstraintPermission(input.operationUri)
	input.object.content.id != "header/navigation/datasets"
	input.object.content.id != "header/navigation/drafts"
}
