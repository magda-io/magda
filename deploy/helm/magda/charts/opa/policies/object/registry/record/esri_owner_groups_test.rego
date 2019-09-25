package object.registry.record.esri_owner_groups

test_allow_read_if_groups_and_permission_are_correct {
    read with input as {
        "user": {
            "permissions": [
                {
                   "operations": [
                       {
                           "uri": "object/registry/record/read"
                       }
                   ]
                }
            ],
            "session": {
                "esriGroups": ["G1", "G2"],
                "esriTimestamp": 99
            }
        },

        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "groups": ["G2", "G3"],
                        "expiration": 100
                    }
                }
            }
        }
    }
}

test_allow_read_if_owner_and_permission_are_correct {
    read with input as {
        "user": {
            "permissions": [
                {
                   "operations": [
                       {
                           "uri": "object/registry/record/read"
                       }
                   ]
                }
            ],
            "session": {
                "esriUser": "Person.A",
                "esriTimestamp": 99
            }
        },

        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "owner": "Person.A",
                        "expiration": 100
                    }
                }
            }
        }
    }
}

test_allow_read_if_public {
    read with input as {
        "user": {
            "session": {
                "esriTimestamp": 99
            }
        },
        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "access": "public",
                        "expiration": 100
                    }
                }
            }
        }
    }
}

test_deny_read_if_no_access_attributes {
    not read with input as {
        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                    }
                }
            }
        }
    }
}


test_allow_read_if_not_owner_but_groups_and_permission_are_correct {
    read with input as {
        "user": {
            "permissions": [
                {
                   "operations": [
                       {
                           "uri": "object/registry/record/read"
                       }
                   ]
                }
            ],
            "session": {
                "esriGroups": ["G1", "G2"],
                "esriUser": "Person.A",
                "esriTimestamp": 99
            }
        },

        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "groups": ["G2", "G3"],
                        "owner": "Person.B",
                        "expiration": 100
                    }
                }
            }
        }
    }
}

test_allow_read_if_owner_but_groups_are_incorrect {
    read with input as {
        "user": {
            "permissions": [
                {
                   "operations": [
                       {
                           "uri": "object/registry/record/read"
                       }
                   ]
                }
            ],
            "session": {
                "esriGroups": ["G1", "G2"],
                "esriUser": "Person.A",
                "esriTimestamp": 99
            }
        },

        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "groups": ["G4", "G5"],
                        "owner": "Person.A",
                        "expiration": 100
                    }
                }
            }
        }
    }
}

test_deny_read_if_owner_and_groups_are_incorrect {
    not read with input as {
        "user": {
            "permissions": [
                {
                   "operations": [
                       {
                           "uri": "object/registry/record/read"
                       }
                   ]
                }
            ],
            "session": {
                "esriGroups": ["G1", "G2"],
                "esriUser": "Person.A",
                "esriTimestamp": 99
            }
        },

        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "groups": ["G4", "G5"],
                        "owner": "Person.B",
                        "expiration": 100
                    }
                }
            }
        }
    }
}

test_deny_read_if_groups_are_incorrect {
    not read with input as {
        "user": {
            "session": {
                "esriGroups": ["G1", "G2"],
                "esriTimestamp": 99
            },
            "permissions": [
                {
                   "operations": [
                       {
                           "uri": "object/registry/record/read"
                       }
                   ]
                }
            ]
        },

        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "groups": ["G3", "G4"],
                        "expiration": 100
                    }
                }
            }
        }
    }
}

test_deny_read_if_owner_is_incorrect {
    not read with input as {
        "user": {
            "permissions": [
                {
                   "operations": [
                       {
                           "uri": "object/registry/record/read"
                       }
                   ]
                }
            ],
            "session": {
                "esriUser": "Person.A",
                "esriTimestamp": 99
            }
        },

        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "owner": "Person.B",
                        "expiration": 100
                    }
                }
            }
        }
    }
}

test_deny_read_if_permission_is_incorrect {
    not read with input as {
        "user": {
            "session": {
                "esriGroups": ["G1", "G2"],
                "esriTimestamp": 99
            },
            "permissions": [
                {
                   "operations": [
                       {
                           "uri": "object/registry/record/not_read"
                       }
                   ]
                }
            ]
        },

        "object": {
            "registry": {
                "record": {
                    "esri-access-control": {
                        "orgUnitOwnerId": ["G1", "G2"],
                        "expiration": 100
                    }
                }
            }
        }
    }
}
