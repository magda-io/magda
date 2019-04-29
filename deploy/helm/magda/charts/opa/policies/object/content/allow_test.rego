package object.content

test_allow_any_non_header_footer_content_items {
    allow with input as {
        "operationUri": "object/content/lang/*",
        "object": {
            "content": {
                "id": "lang/en/global/appName"
            }
        },
        "user": {
            "displayName": "Jacky Jiang",
            "email": "t83714@gmail.com",
            "id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
            "isAdmin": false,
            "permissions": [],
            "photoURL": "//www.gravatar.com/avatar/bed026a33c154abec6852b4e313bf1ce",
            "roles": [
                {
                    "id": "00000000-0000-0002-0000-000000000000",
                    "name": "Authenticated Users",
                    "permissionIds": [
                        "e5ce2fc4-9f38-4f52-8190-b770ed2074e6"
                    ]
                }
            ],
            "source": "ckan"
        }
    }
}

test_allow_header_items_with_wildcard {
    allow with input as {
        "operationUri": "object/content/header/**",
        "object": {
            "content": {
                # * indicate wildcard search (use glob match)
                "id": "header/**"
            }
        },
        "user": {
            "displayName": "Jacky Jiang",
            "email": "t83714@gmail.com",
            "id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
            "isAdmin": false,
            "permissions": [
                {
                    "id": "72d52505-cf96-47b2-9b74-d0fdc1f5aee7",
                    "name": "Allow Access All Header Items",
                    "operations": [
                        {
                            "id": "bf946197-392a-4dbb-a7e1-789424e231a4",
                            "name": "Access All Header Items",
                            "uri": "object/content/header/**"
                        }
                    ],
                    "orgUnitOwnershipConstraint": false,
                    "preAuthorisedConstraint": false,
                    "resourceId": "ea5d2d58-165a-48cb-9b22-42edd6a3024a",
                    "resourceUri": "object/content",
                    "userOwnershipConstraint": false
                }
            ],
            "photoURL": "//www.gravatar.com/avatar/bed026a33c154abec6852b4e313bf1ce",
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
                    "name": "Approvers",
                    "permissionIds": [
                        "e5ce2fc4-9f38-4f52-8190-b770ed2074e6",
                        "72d52505-cf96-47b2-9b74-d0fdc1f5aee7"
                    ]
                }
            ],
            "source": "ckan"
        }
    }
}


test_allow_header_items_with_wildcard_against_specific_uri_permission {
    allow with input as {
        "operationUri": "object/content/header/**",
        "object": {
            "content": {
                "id": "header/navigation/drafts"
            }
        },
        "user": {
            "displayName": "Jacky Jiang",
            "email": "t83714@gmail.com",
            "id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
            "isAdmin": false,
            "permissions": [
                {
                    "id": "72d52505-cf96-47b2-9b74-d0fdc1f5aee7",
                    "name": "Allow Access to header/navigation/drafts",
                    "operations": [
                        {
                            "id": "bf946197-392a-4dbb-a7e1-789424e231a4",
                            "name": "Access to header/navigation/drafts",
                            "uri": "object/content/header/navigation/drafts"
                        }
                    ],
                    "orgUnitOwnershipConstraint": false,
                    "preAuthorisedConstraint": false,
                    "resourceId": "ea5d2d58-165a-48cb-9b22-42edd6a3024a",
                    "resourceUri": "object/content",
                    "userOwnershipConstraint": false
                }
            ],
            "photoURL": "//www.gravatar.com/avatar/bed026a33c154abec6852b4e313bf1ce",
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
                    "name": "Approvers",
                    "permissionIds": [
                        "e5ce2fc4-9f38-4f52-8190-b770ed2074e6",
                        "72d52505-cf96-47b2-9b74-d0fdc1f5aee7"
                    ]
                }
            ],
            "source": "ckan"
        }
    }
}

test_allow_header_items_with_no_wildcard_against_specific_uri_permission {
    allow with input as {
        "operationUri": "object/content/header/navigation/drafts",
        "object": {
            "content": {
                "id": "header/navigation/drafts"
            }
        },
        "user": {
            "displayName": "Jacky Jiang",
            "email": "t83714@gmail.com",
            "id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
            "isAdmin": false,
            "permissions": [
                {
                    "id": "72d52505-cf96-47b2-9b74-d0fdc1f5aee7",
                    "name": "Allow Access to header/navigation/drafts",
                    "operations": [
                        {
                            "id": "bf946197-392a-4dbb-a7e1-789424e231a4",
                            "name": "Access to header/navigation/drafts",
                            "uri": "object/content/header/navigation/drafts"
                        }
                    ],
                    "orgUnitOwnershipConstraint": false,
                    "preAuthorisedConstraint": false,
                    "resourceId": "ea5d2d58-165a-48cb-9b22-42edd6a3024a",
                    "resourceUri": "object/content",
                    "userOwnershipConstraint": false
                }
            ],
            "photoURL": "//www.gravatar.com/avatar/bed026a33c154abec6852b4e313bf1ce",
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
                    "name": "Approvers",
                    "permissionIds": [
                        "e5ce2fc4-9f38-4f52-8190-b770ed2074e6",
                        "72d52505-cf96-47b2-9b74-d0fdc1f5aee7"
                    ]
                }
            ],
            "source": "ckan"
        }
    }
}

test_allow_header_items_with_no_wildcard_against_specific_uri_permission_against_wrong_content_id {
    not allow with input as {
        "operationUri": "object/content/header/navigation/drafts",
        "object": {
            "content": {
                "id": "header/navigation/home"
            }
        },
        "user": {
            "displayName": "Jacky Jiang",
            "email": "t83714@gmail.com",
            "id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
            "isAdmin": false,
            "permissions": [
                {
                    "id": "72d52505-cf96-47b2-9b74-d0fdc1f5aee7",
                    "name": "Allow Access to header/navigation/drafts",
                    "operations": [
                        {
                            "id": "bf946197-392a-4dbb-a7e1-789424e231a4",
                            "name": "Access to header/navigation/drafts",
                            "uri": "object/content/header/navigation/drafts"
                        }
                    ],
                    "orgUnitOwnershipConstraint": false,
                    "preAuthorisedConstraint": false,
                    "resourceId": "ea5d2d58-165a-48cb-9b22-42edd6a3024a",
                    "resourceUri": "object/content",
                    "userOwnershipConstraint": false
                }
            ],
            "photoURL": "//www.gravatar.com/avatar/bed026a33c154abec6852b4e313bf1ce",
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
                    "name": "Approvers",
                    "permissionIds": [
                        "e5ce2fc4-9f38-4f52-8190-b770ed2074e6",
                        "72d52505-cf96-47b2-9b74-d0fdc1f5aee7"
                    ]
                }
            ],
            "source": "ckan"
        }
    }
}