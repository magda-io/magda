-- Register LLM access profile operations (#3838), with stock permissions and
-- a stock profile manager role.
--
-- `llm/access`: LLM Services access profiles. Profiles are a central resource:
-- `create`, `read`, `update` and `delete` honour unconstrained permissions only
-- (see `magda-opa/policies/llm/access/allow.rego`). `invoke` uses a profile's
-- models and honours unconstrained, org unit ("audience": the profile's org
-- unit is the user's own org unit or one of its ancestors), pre-authorised (the
-- profile's own managed permission) and exemption ("public" profile) grants.
--
-- `llm/usage`: other users' LLM usage. `read` honours unconstrained
-- permissions only; users always read their own usage without a permission.
--
-- The "LLM Profile Managers" stock role is unassigned. The stock "Use LLM
-- Profiles" permission joins the existing (also unassigned) "Agent Workspace
-- Users" role: on its own it grants nothing until a profile has an org unit or
-- is public. Nothing is granted to Anonymous or Authenticated Users.
--
-- IDs: resource and operation IDs are generated and referenced by `uri`, as in
-- V2_4. Permission and role IDs are fixed: they are grantable,
-- administrator-referenced records.

-- Resources and operations

WITH rows AS (
    INSERT INTO "public"."resources" ("uri", "name", "description")
    VALUES
    ('llm/access', 'LLM Access Profiles', 'LLM Services access profiles: which models users may use, and their token limits.')
    RETURNING id
)
INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id")
VALUES
('llm/access/create', 'Create LLM Access Profile', 'Create an LLM access profile.', (SELECT id FROM rows)),
('llm/access/read', 'Read LLM Access Profile', 'Read LLM access profiles and the roles they are granted to.', (SELECT id FROM rows)),
('llm/access/update', 'Update LLM Access Profile', 'Update an LLM access profile, and grant it to or remove it from roles.', (SELECT id FROM rows)),
('llm/access/delete', 'Delete LLM Access Profile', 'Delete an LLM access profile.', (SELECT id FROM rows)),
('llm/access/invoke', 'Use LLM Access Profile', 'Call the models of an LLM access profile, within its token limits.', (SELECT id FROM rows));

WITH rows AS (
    INSERT INTO "public"."resources" ("uri", "name", "description")
    VALUES
    ('llm/usage', 'LLM Usage', 'Other users'' LLM token usage.')
    RETURNING id
)
INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id")
VALUES
('llm/usage/read', 'Read LLM Usage', 'Read other users'' LLM token usage.', (SELECT id FROM rows));

-- Permissions (fixed IDs)

INSERT INTO "public"."permissions"
("id", "name", "resource_id", "user_ownership_constraint", "org_unit_ownership_constraint", "pre_authorised_constraint", "allow_exemption", "description") VALUES
('00000000-3838-4100-8000-000000000001', 'Manage LLM Access Profiles', (SELECT id FROM "public"."resources" WHERE "uri" = 'llm/access'), false, false, false, false, 'Create, read, update and delete every LLM access profile.'),
('00000000-3838-4100-8000-000000000002', 'Use All LLM Access Profiles', (SELECT id FROM "public"."resources" WHERE "uri" = 'llm/access'), false, false, false, false, 'Use the models of every LLM access profile, within its token limits.'),
('00000000-3838-4100-8000-000000000003', 'Read All LLM Usage', (SELECT id FROM "public"."resources" WHERE "uri" = 'llm/usage'), false, false, false, false, 'Read every user''s LLM token usage.'),
('00000000-3838-4100-8000-000000000004', 'Use LLM Profiles by Org Unit or Public', (SELECT id FROM "public"."resources" WHERE "uri" = 'llm/access'), false, true, false, true, 'Use LLM access profiles of the user''s own org unit or an org unit above it, and public profiles.');

INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") VALUES
-- Manage LLM Access Profiles
('00000000-3838-4100-8000-000000000001', (SELECT id FROM "public"."operations" WHERE "uri" = 'llm/access/create')),
('00000000-3838-4100-8000-000000000001', (SELECT id FROM "public"."operations" WHERE "uri" = 'llm/access/read')),
('00000000-3838-4100-8000-000000000001', (SELECT id FROM "public"."operations" WHERE "uri" = 'llm/access/update')),
('00000000-3838-4100-8000-000000000001', (SELECT id FROM "public"."operations" WHERE "uri" = 'llm/access/delete')),
-- Use All LLM Access Profiles
('00000000-3838-4100-8000-000000000002', (SELECT id FROM "public"."operations" WHERE "uri" = 'llm/access/invoke')),
-- Read All LLM Usage
('00000000-3838-4100-8000-000000000003', (SELECT id FROM "public"."operations" WHERE "uri" = 'llm/usage/read')),
-- Use LLM Profiles by Org Unit or Public
('00000000-3838-4100-8000-000000000004', (SELECT id FROM "public"."operations" WHERE "uri" = 'llm/access/invoke'));

-- Stock role (fixed ID, unassigned)

INSERT INTO "public"."roles" ("id", "name", "description") VALUES
('00000000-3838-4200-8000-000000000001', 'LLM Profile Managers', 'Unassigned stock role for central LLM access profile management: manage and use every profile, and read all LLM usage.');

INSERT INTO "public"."role_permissions" ("role_id", "permission_id") VALUES
('00000000-3838-4200-8000-000000000001', '00000000-3838-4100-8000-000000000001'),
('00000000-3838-4200-8000-000000000001', '00000000-3838-4100-8000-000000000002'),
('00000000-3838-4200-8000-000000000001', '00000000-3838-4100-8000-000000000003'),
-- Agent Workspace Users (V2_4): LLM access by org unit or public profile
((SELECT id FROM "public"."roles" WHERE "id" = '00000000-3854-4200-8000-000000000001'), '00000000-3838-4100-8000-000000000004');
