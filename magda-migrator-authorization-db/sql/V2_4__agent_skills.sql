-- Agent Skills are typed Registry records. Authenticated users may read system
-- skills and manage only their own user skills; the OPA policy deliberately
-- refuses to apply the unconstrained system-read permission to user skills.

INSERT INTO "public"."resources" ("id", "uri", "name", "description")
VALUES (
    '078c459f-6fa6-46be-a47d-e657854ebf95',
    'object/agentSkill',
    'Agent Skills',
    'Validated Agent Skill publications managed by Agent Services.'
);

INSERT INTO "public"."operations" ("id", "uri", "name", "description", "resource_id")
VALUES
(
    '54ef6ae7-ad91-46a1-a747-0567d88a5af2',
    'object/agentSkill/create',
    'Create Agent Skill',
    'Create an Agent Skill publication.',
    '078c459f-6fa6-46be-a47d-e657854ebf95'
),
(
    '301c2879-86b8-4397-95e9-652e59c44a5f',
    'object/agentSkill/read',
    'Read Agent Skill',
    'Read Agent Skill metadata or its published archive.',
    '078c459f-6fa6-46be-a47d-e657854ebf95'
),
(
    'aa0f9476-1879-423c-8fa4-4cc56486f05d',
    'object/agentSkill/update',
    'Update Agent Skill',
    'Replace an Agent Skill publication.',
    '078c459f-6fa6-46be-a47d-e657854ebf95'
),
(
    'c806566f-bfb4-4ad7-aee6-cdb46e9b5690',
    'object/agentSkill/delete',
    'Delete Agent Skill',
    'Delete an Agent Skill publication.',
    '078c459f-6fa6-46be-a47d-e657854ebf95'
);

INSERT INTO "public"."permissions"
    ("id", "name", "resource_id", "user_ownership_constraint", "org_unit_ownership_constraint", "pre_authorised_constraint", "description")
VALUES
(
    '108d9223-e0f1-4591-bdca-03c94bcb6a89',
    'Read System Agent Skills',
    '078c459f-6fa6-46be-a47d-e657854ebf95',
    false,
    false,
    false,
    'Allows authenticated users to read system-scoped Agent Skills only.'
),
(
    'af8b612c-c849-4324-852f-665adafdeb0d',
    'Manage Own User Agent Skills',
    '078c459f-6fa6-46be-a47d-e657854ebf95',
    true,
    false,
    false,
    'Allows authenticated users to create, read, update and delete their own user-scoped Agent Skills.'
);

INSERT INTO "public"."permission_operations" ("permission_id", "operation_id")
VALUES
(
    '108d9223-e0f1-4591-bdca-03c94bcb6a89',
    '301c2879-86b8-4397-95e9-652e59c44a5f'
),
(
    'af8b612c-c849-4324-852f-665adafdeb0d',
    '54ef6ae7-ad91-46a1-a747-0567d88a5af2'
),
(
    'af8b612c-c849-4324-852f-665adafdeb0d',
    '301c2879-86b8-4397-95e9-652e59c44a5f'
),
(
    'af8b612c-c849-4324-852f-665adafdeb0d',
    'aa0f9476-1879-423c-8fa4-4cc56486f05d'
),
(
    'af8b612c-c849-4324-852f-665adafdeb0d',
    'c806566f-bfb4-4ad7-aee6-cdb46e9b5690'
);

INSERT INTO "public"."role_permissions" ("role_id", "permission_id")
VALUES
(
    '00000000-0000-0002-0000-000000000000',
    '108d9223-e0f1-4591-bdca-03c94bcb6a89'
),
(
    '00000000-0000-0002-0000-000000000000',
    'af8b612c-c849-4324-852f-665adafdeb0d'
);
