package object.registry.record

test_allow_correct_orgunit {
    orgunit with input as {
        "user": {
            "managingOrgUnitIds": ["1", "2", "3", "4"]
        },
        "object": {
            "registry": {
                "record": {
                    "access-control": {
                        "orgUnitId": "3"
                    }
                }
            }
        }
    }
}

test_deny_wrong_orgunit {
    not orgunit with input as {
        "user": {
            "managingOrgUnitIds": ["1", "2", "3", "4"]
        },
        "object": {
            "registry": {
                "record": {
                    "access-control": {
                        "orgUnitId": "5"
                    }
                }
            }
        }
    }
}

test_deny_no_access_control_info {
    not orgunit with input as {
        "user": {
            "managingOrgUnitIds": ["1", "2", "3", "4"]
        },
        "object": {
            "registry": {
                "record": {
                }
            }
        }
    }
}

test_deny_empty_managing_orgunit_ids {
    not orgunit with input as {
        "user": {
            "managingOrgUnitIds": []
        },
        "object": {
            "registry": {
                "record": {
                    "access-control": {
                        "orgUnitId": "5"
                    }
                }
            }
        }
    }
}
