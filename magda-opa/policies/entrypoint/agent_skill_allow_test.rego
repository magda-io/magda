package entrypoint

entrypoint_system_read_permission := {
    "resourceUri": "object/agentSkill",
    "userOwnershipConstraint": false,
    "orgUnitOwnershipConstraint": false,
    "preAuthorisedConstraint": false,
    "operations": [{"uri": "object/agentSkill/read"}]
}

test_entrypoint_delegates_agent_skill_read {
    allow with input as {
        "operationUri": "object/agentSkill/read",
        "object": {"agentSkill": {
            "agent-skill": {"scope": "system"},
            "access-control": {"ownerId": "admin-id"}
        }},
        "user": {"id": "user-id", "roles": [], "permissions": [entrypoint_system_read_permission]}
    }
}

test_entrypoint_admin_can_mutate_system_skill {
    allow with input as {
        "operationUri": "object/agentSkill/delete",
        "object": {"agentSkill": {
            "agent-skill": {"scope": "system"},
            "access-control": {"ownerId": "admin-id"}
        }},
        "user": {
            "id": "admin-id",
            "roles": [{"id": "00000000-0000-0003-0000-000000000000"}],
            "permissions": []
        }
    }
}
