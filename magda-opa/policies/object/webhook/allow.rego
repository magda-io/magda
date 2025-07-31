package object.webhook

import rego.v1

import data.common.hasNoConstraintPermission
import data.common.hasOwnerConstraintPermission

default allow := false

# Only users has a unlimited permission to perfom the operation on "webhook" will be allowed
allow if {
	hasNoConstraintPermission(input.operationUri)
}

# Rules for permissions with ownership constaint
# i.e. only owner of the webhook can perform the operation
allow if {
	hasOwnerConstraintPermission(input.operationUri)

	# webhook field name should match table column name
	# as we didn't quoted column name when create the table
	# either uppercase or lowercase will work
	input.object.webhook.ownerId == input.user.id
}
