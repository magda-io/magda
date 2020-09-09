package object.registry.record.owner_only

test_allow_read_if_owner_and_permission_are_correct_regardless_orgunit {
    read with input as {
        "user": {
            "id": "personA",
            "permissions": [
                {
                   "operations": [
                       {
                           "uri": "object/registry/record/read"
                       }
                   ]
                }
            ],
            "managingOrgUnitIds": []
        },

        "object": {
            "registry": {
                "record": {
                    "dataset-access-control": {
                        "ownerId": "personA",
                        "orgUnitOwnerId": "3"
                    }
                }
            }
        }
    }
}

test_deny_read_if_owner_and_permission_are_incorrect {
    not read with input as {
        "user": {
            "id": "personA",
            "permissions": [
                {
                   "operations": [
                       {
                           "uri": "object/registry/record/read"
                       }
                   ]
                }
            ],
            "managingOrgUnitIds": ["3"]
        },

        "object": {
            "registry": {
                "record": {
                    "dataset-access-control": {
                        "ownerId": "personB",
                        "orgUnitOwnerId": "3"
                    }
                }
            }
        }
    }
}