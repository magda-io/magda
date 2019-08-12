package object.registry.aspect.partial

test_orgunit_happy {
    orgunit with input as {
        "user": {
            "managingOrgUnitIds": ["1", "2", "3", "4"],
            "permissions": [
                {"uri": "object/aspect/view"}
            ]
        },
        "object": {
            "aspects": {
                "access-control": {
                    "orgUnitOwnerId": "3"
                }
            }
        }
    }
}

test_orgunit_wrong_org_unit {
    not orgunit with input as {
        "user": {
            "managingOrgUnitIds": ["1", "2", "3", "4"],
            "permissions": [
                {"uri": "object/aspect/view"}
            ]
        },
        "object": {
            "aspects": {
                "access-control": {
                    "orgUnitOwnerId": "5"
                }
            }
        }
    }
}

test_orgunit_no_access_control {
    not orgunit with input as {
        "user": {
            "managingOrgUnitIds": ["1", "2", "3", "4"],
            "permissions": [
                {"uri": "object/aspect/view"}
            ]
        },
        "object": {
            "aspects": {
            }
        }
    }
}

test_orgunit_user_not_in_org_tree {
    not orgunit with input as {
        "user": {
            "managingOrgUnitIds": [],
            "permissions": [
                {"uri": "object/aspect/view"}
            ]
        },
        "object": {
            "aspects": {
                "access-control": {
                    "orgUnitOwnerId": "5"
                }
            }
        }
    }
    
}
