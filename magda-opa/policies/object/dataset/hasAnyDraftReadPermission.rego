package object.dataset

default hasAnyDraftReadPermission = false

hasAnyDraftReadPermission {
    input.user.permissions[_].operations[_].uri = "object/dataset/draft/read"
}

hasAnyDraftReadPermission {
    # users with admin roles will have access to everything
    input.user.roles[_].id == "00000000-0000-0003-0000-000000000000"
}