package common

breakdownOperationUri(operationUri) = [resourceType, operationType, resourceUriPrefix] {
    parts := split(operationUri, "/")
    operationType := parts[count(parts)-1]
    resourceType := parts[count(parts)-2]
    resourceUriPrefix := concat("/", array.slice(parts, 0, count(parts)-2))
}