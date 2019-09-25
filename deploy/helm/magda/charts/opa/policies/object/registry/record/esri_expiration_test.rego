package object.registry.record

test_allow_if_not_expired {
    esri_expiration with input as {
        "user": {
            "session": {
                "esriTimestamp": 99
            }
        },
        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "expiration": 100
                    }
                }
            }
        }
    }
}

test_deny_if_expired {
    not esri_expiration with input as {
        "user": {
            "session": {
                "esriTimestamp": 101
            }
        },
        "object": {
            "record": {
                "esri-access-control": {
                    "expiration": 100
                }
            }
        }
    }
}

test_deny_no_access_control_info {
    not esri_expiration with input as {
        "user": {
            "session": {
                "esriTimestamp": 10
            }
        },
        "object": {
            "record": {
                "esri-access-control": {
                }
            }
        }
    }
}
