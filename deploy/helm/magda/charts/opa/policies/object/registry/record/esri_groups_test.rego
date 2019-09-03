package object.registry.record.owner_orgunit

test_allow_read_if_groups_and_permission_are_correct {
    read with input as {
        "user": {
            "permissions": [
                {
                   "operations": [
                       {
                           "uri": "object/registry/record/read"
                       }
                   ]
                }
            ],
            "groups": ["G1", "G2"]
        },

        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "groups": ["G2", "G3"]
                    }
                }
            }
        }
    }
}


test_deny_read_if_groups_are_incorrect {
    not read with input as {
        "user": {
            "groups": ["G1", "G2"],
            "permissions": [
                {
                   "operations": [
                       {
                           "uri": "object/registry/record/read"
                       }
                   ]
                }
            ]
        },

        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "groups": ["G3", "G4"]
                    }
                }
            }
        }
    }
}

test_deny_read_if_permission_is_incorrect {
    not read with input as {
        "user": {
            "groups": ["G1", "G2"],
            "permissions": [
                {
                   "operations": [
                       {
                           "uri": "object/registry/record/not_read"
                       }
                   ]
                }
            ]
        },

        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "orgUnitOwnerId": ["G1", "G2"]
                    }
                }
            }
        }
    }
}
