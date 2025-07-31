package common

import rego.v1

getResourceTypeFromResourceUri(resourceUri) := resourceType if {
	parts := split(resourceUri, "/")
	resourceType := parts[count(parts) - 1]
}
