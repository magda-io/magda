package object.registry.record

test_allow_all_matched_groups {
    esri_groups with input as {
        "user": {
            "session" : {
            "esriGroups": ["G1", "G2"]
            }
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

test_allow_any_matched_groups {
    esri_groups with input as {
        "user": {
            "session" : {
                "esriGroups": ["G1", "G2"]
            }
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
    not esri_groups with input as {
        "user": {
            "session" : {
                "esriGroups": ["G1", "G2"]
            }
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
    not esri_groups with input as {
        "user": {
            "session" : {
                "esriGroups": ["G1", "G2"]
            }
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
    not esri_groups with input as {
        "user": {
            "session" : {
                "esriGroups": []
            }
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
