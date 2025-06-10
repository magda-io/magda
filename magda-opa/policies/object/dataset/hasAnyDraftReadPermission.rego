package object.dataset

import rego.v1

default hasAnyDraftReadPermission := false

hasAnyDraftReadPermission if {
	input.user.permissions[_].operations[_].uri == "object/dataset/draft/read"
}

hasAnyDraftReadPermission if {
	# users with admin roles will have access to everything
	input.user.roles[_].id == "00000000-0000-0003-0000-000000000000"
}
