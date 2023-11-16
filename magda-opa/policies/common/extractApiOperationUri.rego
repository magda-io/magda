package common

# for example, extractApiOperationUri("/api/myApi/health/get") = ["/myApi/health", "GET"]
# extractApiOperationUri("/api/myApi/health/all") = ["/myApi/health", "ALL"]
extractApiOperationUri(operationUri) = [requestPath, requestMethod] {
    parts := split(operationUri, "/")
    requestMethod := upper(parts[count(parts)-1])
    requestPath := concat("/", array.slice(parts, 1, count(parts)-1))
}