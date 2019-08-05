package object.registry.record.partial

test_allow_owner {
    owner with input as {
        "user": {
            "id": "personA"
        },
        "object": {
            "records": {
                "access-control": {
                    "ownerId": "personA"
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
            "records": {
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
            "records": {
                "access-control": {
                    "someOtherKey": "personB"
                }
            }
        }
    }
}
