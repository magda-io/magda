package storage.object

ownerConstraintUser(userId, operationUri) = user {
    user := {
        "id": userId,
        "permissions": [{
            "id": "8f6b3c1e-1c4b-4c0e-9d2b-7a3f2f6c9a10",
            "name": "Storage Object Permission with Ownership Constraint",
            "resourceUri": "storage/object",
            "userOwnershipConstraint": true,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [{"uri": operationUri}]
        }],
        "managingOrgUnitIds": []
    }
}

test_allow_owner_constraint_read_own_object {
    allow with input as {
        "operationUri": "storage/object/read",
        "user": ownerConstraintUser("user-a", "storage/object/read"),
        "storage": {
            "object": {
                "bucketName": "magda-datasets",
                "name": "ds-1/dist-1/data.csv",
                "ownerId": "user-a"
            }
        }
    }
}

test_not_allow_owner_constraint_read_other_users_object {
    not allow with input as {
        "operationUri": "storage/object/read",
        "user": ownerConstraintUser("user-b", "storage/object/read"),
        "storage": {
            "object": {
                "bucketName": "magda-datasets",
                "name": "ds-1/dist-1/data.csv",
                "ownerId": "user-a"
            }
        }
    }
}

test_not_allow_owner_constraint_read_object_without_owner {
    not allow with input as {
        "operationUri": "storage/object/read",
        "user": ownerConstraintUser("user-a", "storage/object/read"),
        "storage": {
            "object": {
                "bucketName": "magda-datasets",
                "name": "ds-1/dist-1/data.csv"
            }
        }
    }
}

test_allow_owner_constraint_upload_own_object {
    allow with input as {
        "operationUri": "storage/object/upload",
        "user": ownerConstraintUser("user-a", "storage/object/upload"),
        "storage": {
            "object": {
                "bucketName": "magda-datasets",
                "name": "ds-1/dist-1/data.csv",
                "ownerId": "user-a",
                "size": 1024
            }
        }
    }
}

test_not_allow_owner_constraint_upload_other_users_object {
    not allow with input as {
        "operationUri": "storage/object/upload",
        "user": ownerConstraintUser("user-b", "storage/object/upload"),
        "storage": {
            "object": {
                "bucketName": "magda-datasets",
                "name": "ds-1/dist-1/data.csv",
                "ownerId": "user-a",
                "size": 1024
            }
        }
    }
}

test_allow_owner_constraint_delete_own_object {
    allow with input as {
        "operationUri": "storage/object/delete",
        "user": ownerConstraintUser("user-a", "storage/object/delete"),
        "storage": {
            "object": {
                "bucketName": "magda-datasets",
                "name": "ds-1/dist-1/data.csv",
                "ownerId": "user-a"
            }
        }
    }
}

test_not_allow_owner_constraint_delete_other_users_object {
    not allow with input as {
        "operationUri": "storage/object/delete",
        "user": ownerConstraintUser("user-b", "storage/object/delete"),
        "storage": {
            "object": {
                "bucketName": "magda-datasets",
                "name": "ds-1/dist-1/data.csv",
                "ownerId": "user-a"
            }
        }
    }
}
