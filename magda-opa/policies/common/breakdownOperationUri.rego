package common

import rego.v1

breakdownOperationUri(operationUri) := [resourceType, operationType, resourceUriPrefix] if {
	parts := split(operationUri, "/")
	operationType := parts[count(parts) - 1]
	resourceType := parts[count(parts) - 2]
	resourceUriPrefix := concat("/", array.slice(parts, 0, count(parts) - 2))
}

hasOperationType(operationUri, operationType) if {
	operationType == breakdownOperationUri(operationUri)[1]
}
