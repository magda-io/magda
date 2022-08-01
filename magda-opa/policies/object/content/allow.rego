package object.content

import data.common.hasNoConstraintPermission

default allow = false

# handle all operations except "read"
allow {
    input.operationUri != "object/content/read"
    hasNoConstraintPermission(input.operationUri)
}

# handle "read" operation for `header/navigation/drafts`
allow {
    input.operationUri == "object/content/read"
    hasNoConstraintPermission(input.operationUri)
    input.object.content.id = "header/navigation/drafts"
    hasAnyDraftReadPermission
}

# handle "read" operation for `header/navigation/datasets`
allow {
    input.operationUri == "object/content/read"
    hasNoConstraintPermission(input.operationUri)
    input.object.content.id = "header/navigation/datasets"
    hasAnyPublishedReadPermission
}

# handle "read" operation for any other cases
allow {
    input.operationUri == "object/content/read"
    hasNoConstraintPermission(input.operationUri)
    input.object.content.id != "header/navigation/datasets"
    input.object.content.id != "header/navigation/drafts"
}