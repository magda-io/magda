package llm.access

import data.common.hasNoConstraintPermission
import data.common.hasOrgUnitConstraintPermission
import data.common.hasPermissionAllowExemption

default allow = false

# LLM access profiles (#3838) are authorised with `llm/access/*` operations.
# The decision input is a profile, as `input.object.llmAccessProfile`, in a
# flat shape whose field names are LLM Services' SQL column names
# (`org_unit_id`, `use_permission_id`, `constraint_exemption`), so LLM Services
# can translate a partial decision into SQL over its `access_profiles` table.
#
# - `create`, `read`, `update`, `delete`: profiles are a central resource,
#   managed by central trusted users. Only unconstrained permissions (and
#   administrators) are honoured.
# - `invoke`: use a profile's models. Honoured for an authenticated user with:
#   1. an unconstrained permission: any profile;
#   2. an org unit constrained permission, with **audience** meaning: the
#      profile's org unit is the user's own org unit or one of its ancestors
#      (`input.user.orgUnitAncestorIds`). This is deliberately the reverse of
#      the usual management scope (`managingOrgUnitIds`): a profile placed on
#      org unit X is for everyone in X's subtree, and a user never reaches the
#      profiles of the org units below them;
#   3. a pre-authorised permission whose ID is the profile's own managed
#      permission (`use_permission_id`);
#   4. any invoke permission that allows exemption, on a public profile
#      (`constraint_exemption`).
#   Owner-constrained permissions match nothing: profiles have no owner.
#
# LLM Services only asks for decisions on enabled, ready profiles that cover
# the requested model, and checks token limits separately.
#
# Rules use only literal comparisons and existence checks, so a partial
# decision can be translated into SQL.

managementOperation("llm/access/create")

managementOperation("llm/access/read")

managementOperation("llm/access/update")

managementOperation("llm/access/delete")

allow {
	managementOperation(input.operationUri)
	hasNoConstraintPermission(input.operationUri)
}

invoke {
	input.operationUri == "llm/access/invoke"
	is_string(input.user.id)
	input.user.id != ""
}

# 1. unconstrained
allow {
	invoke
	hasNoConstraintPermission("llm/access/invoke")
}

# 2. audience org unit
allow {
	invoke
	hasOrgUnitConstraintPermission("llm/access/invoke")
	input.object.llmAccessProfile.org_unit_id == input.user.orgUnitAncestorIds[_]
}

# 3. the profile's own pre-authorised permission, matched on one permission object
allow {
	invoke
	permission := input.user.permissions[_]
	permission.resourceUri == "llm/access"
	permission.userOwnershipConstraint == false
	permission.orgUnitOwnershipConstraint == false
	permission.preAuthorisedConstraint == true
	permission.operations[_].uri == "llm/access/invoke"
	input.object.llmAccessProfile.use_permission_id == permission.id
}

# 4. public profile
allow {
	invoke
	hasPermissionAllowExemption("llm/access/invoke")
	input.object.llmAccessProfile.constraint_exemption == true
}
