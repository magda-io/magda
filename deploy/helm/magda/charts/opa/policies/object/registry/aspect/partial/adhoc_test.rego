package object.registry.aspect.partial.adhoc

test_adhoc {
    read with input as {
        "user": {
            "managingOrgUnitIds": ["1", "2", "3", "4"],
            "permissions": [
                {"uri": "object/aspect/view"}
            ]
        },
        "object": {
            "aspects": {
                "access-control": {
                    "adhocViewerOrgUnitIds": ["3"]
                }
            }
        }
    }
}
