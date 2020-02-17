package object.registry.record

test_allow_owner {
    esri_owner with input as {
        "user": {
            "session": {
                "esriUser": "personA"
            }
        },
        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "owner": "personA"
                    }
                }
            }
        }
    }
}

test_deny_non_owner {
    not esri_owner with input as {
        "user": {
            "session": {
                "esriUser": "personA"
            }
        },
        "object": {
            "record": {
                "esri-access-control": {
                    "owner": "personB"
                }
            }
        }
    }
}

test_deny_no_access_control_info {
    not esri_owner with input as {
        "user": {
            "session": {
                "esriUser": "personA"
            }
        },
        "object": {
            "record": {
                "esri-access-control": {
                    "someOtherKey": "personA"
                }
            }
        }
    }
}
