package api

import data.common.extractApiOperationUri
import rego.v1

# allow policy defines rules for generic gateway level enforcement based on HTTP request path & method
# system admin might choose to use this access model for APIs that doesn't require making access control decision with high level data model
# when receive request, gateway will consult the entrypoint policy with `operationUri` constructed as `api/[requestPath]/[requestMethod]` eg. `api/myApi/endpoint1/GET`.
# It's possible that gateway emits an `operationUri` include parameter like `api/myApi/records/123/fullSummary/GET`. Here `123` is record ID.
# To support it, system admin needs to define resourceUri using glob pattern,
# e.g. above `operationUri` match `resourceUri` `api/myApi/records/*/fullSummary` and operation `GET`.

default allow := false

allow if {
	[requestPath, requestMethod] := extractApiOperationUri(input.operationUri)

	some permission in input.user.permissions
	permission.userOwnershipConstraint == false
	permission.orgUnitOwnershipConstraint == false
	permission.preAuthorisedConstraint == false

	[opRequestPath, opRequestMethod] := extractApiOperationUri(permission.operations[_].uri)

	glob.match(opRequestPath, ["/"], requestPath)
	opRequestMethod == requestMethod
}

allow if {
	[requestPath, _] := extractApiOperationUri(input.operationUri)

	some permission in input.user.permissions
	permission.userOwnershipConstraint == false
	permission.orgUnitOwnershipConstraint == false
	permission.preAuthorisedConstraint == false

	[opRequestPath, opRequestMethod] := extractApiOperationUri(permission.operations[_].uri)

	glob.match(opRequestPath, ["/"], requestPath)
	opRequestMethod == "ALL"
}
