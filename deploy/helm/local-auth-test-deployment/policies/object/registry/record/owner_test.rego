package object.registry.record

test_allow_owner {
    owner with input as {
        "user": {
            "id": "personA"
        },
        "object": {
            "registry": {
                "record": {
                    "access-control": {
                        "ownerId": "personA"
                    }
                }
            }
        }
    }
}

test_deny_non_owner {
    not owner with input as {
        "user": {
            "id": "personA"
        },
        "object": {
            "record": {
                "access-control": {
                    "ownerId": "personB"
                }
            }
        }
    }
}

test_deny_no_access_control_info {
    not owner with input as {
        "user": {
            "id": "personA"
        },
        "object": {
            "record": {
                "access-control": {
                    "someOtherKey": "personB"
                }
            }
        }
    }
}
