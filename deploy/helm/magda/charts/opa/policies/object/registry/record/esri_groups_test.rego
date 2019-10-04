package object.registry.record

test_allow_all_matched_groups {
    esri_groups with input as {
        "user": {
            "session" : {
            "esriGroups": ["G1", "G2"]
            }
        },
        "timestamp": 1569385456740893300,
        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "groups": ["G1", "G2"],
                        "expiration": 9569380434535153100
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
        "timestamp": 1569385456740893300,
        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "groups": ["G2", "G3"],
                        "expiration": 9569380434535153100
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
