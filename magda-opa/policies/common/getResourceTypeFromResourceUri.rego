package common

getResourceTypeFromResourceUri(resourceUri) = resourceType {
    parts := split(resourceUri, "/")
    resourceType := parts[count(parts)-1]
}