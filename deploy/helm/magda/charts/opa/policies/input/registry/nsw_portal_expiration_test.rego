package input.registry

test_allow_if_not_expired {
    nsw_portal_expiration with input as {
        "timestamp": 1569385456740893300,
        "extra": {
            "nsw-portal": {
                "last crawl expiration": 9569380434535153100
            }
        }
    }
}

test_deny_if_expired {
    not nsw_portal_expiration with input as {
        "timestamp": 1569385456740893300,
        "extra": {
            "nsw-portal": {
                "last crawl expiration": 1569385456740893300
            }
        }
    }
}

test_deny_no_access_control_info {
    not nsw_portal_expiration with input as {
        "timestamp": 1569385456740893300,
        "extra": {
        }
    }
}
