package llm.usage

import data.common.hasNoConstraintPermission

default allow = false

# `llm/usage/read` lets a user read **other users'** LLM token usage (#3838).
# Users always read their own usage without a permission. Only unconstrained
# permissions (and administrators) are honoured: usage has no owner, org unit
# or pre-authorised attributes to constrain against.
allow {
	input.operationUri == "llm/usage/read"
	hasNoConstraintPermission("llm/usage/read")
}
