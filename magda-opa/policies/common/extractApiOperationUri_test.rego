package common

import rego.v1

test_extractApiOperationUri_1 if {
	[requestPath, requestMethod] := extractApiOperationUri("api/my-api/xxx/yyy/zzz/get")
	requestPath == "my-api/xxx/yyy/zzz"
	requestMethod == "GET"
}

test_extractApiOperationUri_2 if {
	[requestPath, requestMethod] := extractApiOperationUri("api/my-api/xxx/yyy/zzz/post")
	requestPath == "my-api/xxx/yyy/zzz"
	requestMethod == "POST"
}

test_extractApiOperationUri_3 if {
	[requestPath, requestMethod] := extractApiOperationUri("api/myApi/xxx/yyy/zzz/all")
	requestPath == "myApi/xxx/yyy/zzz"
	requestMethod == "ALL"
}

test_extractApiOperationUri_4 if {
	[requestPath, requestMethod] := extractApiOperationUri("api/myApi/option")
	requestPath == "myApi"
	requestMethod == "OPTION"
}

test_extractApiOperationUri_5 if {
	[requestPath, requestMethod] := extractApiOperationUri("api/myApi")
	requestPath == ""
	requestMethod == "MYAPI"
}

test_extractApiOperationUri_6 if {
	[requestPath, requestMethod] := extractApiOperationUri("api")
	requestPath == ""
	requestMethod == "API"
}

test_extractApiOperationUri_7 if {
	[requestPath, requestMethod] := extractApiOperationUri("api/my-api/records/*/zzz/put")
	requestPath == "my-api/records/*/zzz"
	requestMethod == "PUT"
}

test_extractApiOperationUri_8 if {
	[requestPath, requestMethod] := extractApiOperationUri("api/myApi/endpoint1/DELETE")
	requestPath == "myApi/endpoint1"
	requestMethod == "DELETE"
}
