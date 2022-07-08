package object.dataset

default hasAnyPublishedReadPermission = false

hasAnyPublishedReadPermission {
    input.user.permissions[_].operations[_].uri = "object/dataset/published/read"
}

hasAnyPublishedReadPermission {
    # users with admin roles will have access to everything
    input.user.roles[_].id == "00000000-0000-0003-0000-000000000000"
}