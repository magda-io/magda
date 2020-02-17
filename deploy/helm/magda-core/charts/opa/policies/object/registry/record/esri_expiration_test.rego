package object.registry.record

test_allow_if_not_expired {
    esri_expiration with input as {
        "timestamp": 1569385456740893300,
        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "expiration": 9569380434535153100
                    }
                }
            }
        }
    }
}

test_deny_if_expired {
    not esri_expiration with input as {
        "timestamp": 1569385456740893300,
        "object": {
            "record": {
                "esri-access-control": {
                    "expiration": 1569385456740893300
                }
            }
        }
    }
}

test_deny_no_access_control_info {
    not esri_expiration with input as {
        "timestamp": 1569385456740893300,
        "object": {
            "record": {
                "esri-access-control": {
                }
            }
        }
    }
}
