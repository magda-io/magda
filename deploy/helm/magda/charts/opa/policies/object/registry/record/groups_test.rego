package object.registry.record

test_allow_correct_groups {
    groups with input as {
        "user": {
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

test_deny_wrong_groups {
    not groups with input as {
        "user": {
            "groups": ["G1", "G2"]
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

test_deny_no_access_control_info {
    not groups with input as {
        "user": {
            "groups": ["G1", "G2"]
        },
        "object": {
            "registry": {
                "record": {
                }
            }
        }
    }
}

test_deny_empty_user_groups {
    not groups with input as {
        "user": {
            "groups": []
        },
        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "groups": ["G1", "G2"]
                    }
                }
            }
        }
    }
}
