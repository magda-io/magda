package common

test_verifyRecordPermission_preAuthConstaintPermission_incorrect_permission_id {
    not verifyRecordPermission("object/dataset/read", "dataset") with input as {
        "operationUri": "object/dataset/read",
        "object": {
            "dataset": {
                "access-control": {
                    "preAuthorisedPermissionIds": [
                        # this is not a valid permission id, 
                        # permission has userOwnershipConstraint but not preAuthorisedConstraint
                        "e5ce2fc4-9f38-4f52-8190-b770ed2074e6"
                    ]
                }
            }
        },
        "user": {
            "displayName": "xxxxxxx",
            "email": "xxxxxxxx@sss.com",
            "id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
            "permissions": [
                {
                    "id": "72d52505-cf96-47b2-9b74-d0fdc1f5aee7",
                    "name": "permission with preAuthConstaint",
                    "operations": [
                        {
                            "id": "bf946197-392a-4dbb-a7e1-789424e231a4",
                            "name": "permission with preAuthConstaint",
                            "uri": "object/dataset/read"
                        }
                    ],
                    "orgUnitOwnershipConstraint": false,
                    "preAuthorisedConstraint": true,
                    "resourceId": "ea5d2d58-165a-48cb-9b22-42edd6a3024a",
                    "resourceUri": "object/dataset",
                    "userOwnershipConstraint": false
                },
                {
                    "id": "e5ce2fc4-9f38-4f52-8190-b770ed2074e6",
                    "name": "View Draft Dataset (Own)",
                    "operations": [
                        {
                            "id": "bf946197-392a-4dbb-a7e1-789424e231a4",
                            "name": "Read Draft Dataset",
                            "uri": "object/dataset/read"
                        }
                    ],
                    "orgUnitOwnershipConstraint": false,
                    "preAuthorisedConstraint": false,
                    "resourceId": "ea5d2d58-165a-48cb-9b22-42edd6a3024a",
                    "resourceUri": "object/dataset",
                    "userOwnershipConstraint": true
                }
            ],
            "roles": [
                {
                    "id": "00000000-0000-0002-0000-000000000000",
                    "name": "Authenticated Users",
                    "permissionIds": [
                        "e5ce2fc4-9f38-4f52-8190-b770ed2074e6"
                    ]
                },
                {
                    "id": "14ff3f57-e8ea-4771-93af-c6ea91a798d5",
                    "name": "Test Roles",
                    "permissionIds": [
                        "e5ce2fc4-9f38-4f52-8190-b770ed2074e6",
                        "72d52505-cf96-47b2-9b74-d0fdc1f5aee7"
                    ]
                }
            ]
        }
    }
}

test_verifyRecordPermission_preAuthConstaintPermission_correct_permission_id {
    verifyRecordPermission("object/dataset/read", "dataset") with input as {
        "operationUri": "object/dataset/read",
        "object": {
            "dataset": {
                "access-control": {
                    "preAuthorisedPermissionIds": [
                        # this is a correct permission id
                        "72d52505-cf96-47b2-9b74-d0fdc1f5aee7"
                    ]
                }
            }
        },
        "user": {
            "displayName": "xxxxxxx",
            "email": "xxxxxxxx@sss.com",
            "id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
            "permissions": [
                {
                    "id": "72d52505-cf96-47b2-9b74-d0fdc1f5aee7",
                    "name": "permission with preAuthConstaint",
                    "operations": [
                        {
                            "id": "bf946197-392a-4dbb-a7e1-789424e231a4",
                            "name": "permission with preAuthConstaint",
                            "uri": "object/dataset/read"
                        }
                    ],
                    "orgUnitOwnershipConstraint": false,
                    "preAuthorisedConstraint": true,
                    "resourceId": "ea5d2d58-165a-48cb-9b22-42edd6a3024a",
                    "resourceUri": "object/dataset",
                    "userOwnershipConstraint": false
                },
                {
                    "id": "e5ce2fc4-9f38-4f52-8190-b770ed2074e6",
                    "name": "View Draft Dataset (Own)",
                    "operations": [
                        {
                            "id": "bf946197-392a-4dbb-a7e1-789424e231a4",
                            "name": "Read Draft Dataset",
                            "uri": "object/dataset/read"
                        }
                    ],
                    "orgUnitOwnershipConstraint": false,
                    "preAuthorisedConstraint": false,
                    "resourceId": "ea5d2d58-165a-48cb-9b22-42edd6a3024a",
                    "resourceUri": "object/dataset",
                    "userOwnershipConstraint": true
                }
            ],
            "roles": [
                {
                    "id": "00000000-0000-0002-0000-000000000000",
                    "name": "Authenticated Users",
                    "permissionIds": [
                        "e5ce2fc4-9f38-4f52-8190-b770ed2074e6"
                    ]
                },
                {
                    "id": "14ff3f57-e8ea-4771-93af-c6ea91a798d5",
                    "name": "Test Roles",
                    "permissionIds": [
                        "e5ce2fc4-9f38-4f52-8190-b770ed2074e6",
                        "72d52505-cf96-47b2-9b74-d0fdc1f5aee7"
                    ]
                }
            ]
        }
    }
}
