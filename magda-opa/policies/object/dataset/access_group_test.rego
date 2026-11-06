package object.dataset

# Access groups grant pre-authorised `object/record/*` permissions on registry
# records. A dataset is a registry record, so the grant must also satisfy the
# equivalent dataset operation (#3907), e.g. for search, which asks
# `object/dataset/<state>/read` rather than `object/record/read`.

access_group_user(operationUris) = user {
    user := {
        "id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
        "permissions": [
            {
                "id": "6ab510c2-206c-4d6b-b694-35c4edac2b6d",
                "name": "Access group permission",
                "operations": [{"uri": uri} | uri := operationUris[_]],
                "orgUnitOwnershipConstraint": false,
                "preAuthorisedConstraint": true,
                "resourceUri": "object/record",
                "userOwnershipConstraint": false
            }
        ]
    }
}

access_group_dataset(state, permissionIds) = dataset {
    dataset := {
        "access-control": {
            "ownerId": "3535fdad-1804-4614-a9ce-ce196e880238",
            "orgUnitId": "b66f4fd6-a046-4d30-9ae2-2232351b0a45",
            "preAuthorisedPermissionIds": permissionIds
        },
        "publishing": {"state": state}
    }
}

test_access_group_grant_allows_published_dataset_read {
    allow with input as {
        "operationUri": "object/dataset/published/read",
        "object": {"dataset": access_group_dataset("published", ["6ab510c2-206c-4d6b-b694-35c4edac2b6d"])},
        "user": access_group_user(["object/record/read"])
    }
}

test_access_group_grant_allows_any_state_dataset_read {
    allow with input as {
        "operationUri": "object/dataset/*/read",
        "object": {"dataset": access_group_dataset("published", ["6ab510c2-206c-4d6b-b694-35c4edac2b6d"])},
        "user": access_group_user(["object/record/read"])
    }
}

test_access_group_grant_allows_any_state_read_of_draft_dataset {
    allow with input as {
        "operationUri": "object/dataset/*/read",
        "object": {"dataset": access_group_dataset("draft", ["6ab510c2-206c-4d6b-b694-35c4edac2b6d"])},
        "user": access_group_user(["object/record/read"])
    }
}

test_access_group_grant_requires_requested_publishing_state {
    not allow with input as {
        "operationUri": "object/dataset/published/read",
        "object": {"dataset": access_group_dataset("draft", ["6ab510c2-206c-4d6b-b694-35c4edac2b6d"])},
        "user": access_group_user(["object/record/read"])
    }
}

test_access_group_grant_requires_record_in_group {
    not allow with input as {
        "operationUri": "object/dataset/published/read",
        "object": {"dataset": access_group_dataset("published", ["xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxx"])},
        "user": access_group_user(["object/record/read"])
    }
}

test_access_group_grant_requires_record_with_no_pre_authorised_ids {
    not allow with input as {
        "operationUri": "object/dataset/published/read",
        "object": {"dataset": {
            "access-control": {"ownerId": "3535fdad-1804-4614-a9ce-ce196e880238", "orgUnitId": "b66f4fd6-a046-4d30-9ae2-2232351b0a45"},
            "publishing": {"state": "published"}
        }},
        "user": access_group_user(["object/record/read"])
    }
}

test_access_group_read_grant_does_not_allow_update {
    not allow with input as {
        "operationUri": "object/dataset/published/update",
        "object": {"dataset": access_group_dataset("published", ["6ab510c2-206c-4d6b-b694-35c4edac2b6d"])},
        "user": access_group_user(["object/record/read"])
    }
}

test_access_group_update_grant_allows_update {
    allow with input as {
        "operationUri": "object/dataset/published/update",
        "object": {"dataset": access_group_dataset("published", ["6ab510c2-206c-4d6b-b694-35c4edac2b6d"])},
        "user": access_group_user(["object/record/read", "object/record/update"])
    }
}

test_other_resource_pre_authorised_grant_does_not_allow_dataset_read {
    not allow with input as {
        "operationUri": "object/dataset/published/read",
        "object": {"dataset": access_group_dataset("published", ["6ab510c2-206c-4d6b-b694-35c4edac2b6d"])},
        "user": {
            "id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
            "permissions": [{
                "id": "6ab510c2-206c-4d6b-b694-35c4edac2b6d",
                "operations": [{"uri": "object/agentSkill/user/read"}],
                "orgUnitOwnershipConstraint": false,
                "preAuthorisedConstraint": true,
                "resourceUri": "object/agentSkill/user",
                "userOwnershipConstraint": false
            }]
        }
    }
}
