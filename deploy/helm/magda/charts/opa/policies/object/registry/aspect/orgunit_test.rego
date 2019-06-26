package object.registry.aspect.orgunit

test_orgunit_happy {
    view with input as {
        "user": {
            "managingOrgUnitIds": ["1", "2", "3", "4"],
            "permissions": [
                {"uri": "object/aspect/view"}
            ]
        },
        "object": {
            "aspects": {
                "dataset-access-control": {
                    "orgUnitOwnerId": "3"
                }
            }
        }
    }
}

test_orgunit_adhoc {
    view with input as {
        "user": {
            "managingOrgUnitIds": ["1", "2", "3", "4"],
            "permissions": [
                {"uri": "object/aspect/view"}
            ]
        },
        "object": {
            "aspects": {
                "dataset-access-control": {
                    "adhocViewerOrgUnitIds": ["3"]
                }
            }
        }
    }
}

test_orgunit_wrong_org_unit {
    not view with input as {
        "user": {
            "managingOrgUnitIds": ["1", "2", "3", "4"],
            "permissions": [
                {"uri": "object/aspect/view"}
            ]
        },
        "object": {
            "aspects": {
                "dataset-access-control": {
                    "orgUnitOwnerId": "5"
                }
            }
        }
    }
}

test_orgunit_no_access_control {
    not view with input as {
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
    not view with input as {
        "user": {
            "managingOrgUnitIds": [],
            "permissions": [
                {"uri": "object/aspect/view"}
            ]
        },
        "object": {
            "aspects": {
                "dataset-access-control": {
                    "orgUnitOwnerId": "5"
                }
            }
        }
    }
    
}