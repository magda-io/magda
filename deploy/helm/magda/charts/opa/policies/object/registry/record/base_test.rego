package object.registry.record.base

test_allow_read_if_user_has_right_permission {
    read with input as {
        "user": {
            "permissions": [
                {
                   "operations": [
                       {
                           "id": "some_id",
                           "uri": "object/registry/record/read"
                       }
                   ]
                }
            ]
        }
    }
}

test_deny_read_if_user_has_wrong_permission {
    not read with input as {
        "user": {
            "permissions": [
                {
                   "operations": [
                       {
                           "id": "some_id",
                           "uri": "object/registry/record/not_read"
                       }
                   ]
                }
            ]
        }
    }
}

test_deny_read_by_default_if_input_is_empty {
    not read with input as {

    }
}
