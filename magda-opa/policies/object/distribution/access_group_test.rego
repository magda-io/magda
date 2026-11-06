package object.distribution

# A distribution is a registry record too: an access group's pre-authorised
# `object/record/read` grant also satisfies the distribution read (#3907).

access_group_user = user {
    user := {
        "id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
        "permissions": [
            {
                "id": "6ab510c2-206c-4d6b-b694-35c4edac2b6d",
                "operations": [{"uri": "object/record/read"}],
                "orgUnitOwnershipConstraint": false,
                "preAuthorisedConstraint": true,
                "resourceUri": "object/record",
                "userOwnershipConstraint": false
            }
        ]
    }
}

access_group_distribution(permissionIds) = distribution {
    distribution := {
        "access-control": {
            "ownerId": "3535fdad-1804-4614-a9ce-ce196e880238",
            "orgUnitId": "b66f4fd6-a046-4d30-9ae2-2232351b0a45",
            "preAuthorisedPermissionIds": permissionIds
        },
        "publishing": {"state": "published"}
    }
}

test_access_group_grant_allows_published_distribution_read {
    allow with input as {
        "operationUri": "object/distribution/published/read",
        "object": {"distribution": access_group_distribution(["6ab510c2-206c-4d6b-b694-35c4edac2b6d"])},
        "user": access_group_user
    }
}

test_access_group_grant_allows_any_state_distribution_read {
    allow with input as {
        "operationUri": "object/distribution/*/read",
        "object": {"distribution": access_group_distribution(["6ab510c2-206c-4d6b-b694-35c4edac2b6d"])},
        "user": access_group_user
    }
}

test_access_group_grant_excludes_distribution_outside_group {
    not allow with input as {
        "operationUri": "object/distribution/published/read",
        "object": {"distribution": access_group_distribution([])},
        "user": access_group_user
    }
}
