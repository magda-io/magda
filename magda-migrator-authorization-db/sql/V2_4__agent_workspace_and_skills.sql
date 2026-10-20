-- Register Agent Skill publication operations and the self-only Agent
-- Workspace operation.
--
-- Agent Skills: typed system, user and future (#3861) installation CRUD.
-- There is no wildcard read operation.
--
-- Agent Workspace: `agentWorkspace/access` lets the authenticated user start,
-- inspect, resume, use (DSH runtime HTTP and WebSocket), reset and terminate
-- their **own** Agent Workspace. Agent Manager always derives the target
-- Sandbox from the authenticated user, so the permission never reaches another
-- user's Sandbox.
--
-- Both stock roles are deliberately unassigned, and nothing here is granted to
-- Anonymous or Authenticated Users. Global administrators keep access through
-- the existing entrypoint administrator override. "Agent Skills Admins" does
-- not imply Workspace access.

INSERT INTO "public"."resources" ("id", "uri", "name", "description") VALUES
('078c459f-6fa6-46be-a47d-e657854ebf95', 'object/agentSkill/system', 'System Agent Skills', 'Trusted system Agent Skill publications.'),
('178c459f-6fa6-46be-a47d-e657854ebf95', 'object/agentSkill/user', 'User Agent Skills', 'User-targeted Agent Skill publications.'),
('278c459f-6fa6-46be-a47d-e657854ebf95', 'object/agentSkill/install', 'Installed Agent Skills', 'Future recipient Agent Skill installations registered for #3861.');

INSERT INTO "public"."operations" ("id", "uri", "name", "description", "resource_id") VALUES
('00000000-3854-4000-8000-000000000001', 'object/agentSkill/system/create', 'Create System Agent Skill', 'Create a system Agent Skill publication.', '078c459f-6fa6-46be-a47d-e657854ebf95'),
('00000000-3854-4000-8000-000000000002', 'object/agentSkill/system/read', 'Read System Agent Skill', 'Read a system Agent Skill publication.', '078c459f-6fa6-46be-a47d-e657854ebf95'),
('00000000-3854-4000-8000-000000000003', 'object/agentSkill/system/update', 'Update System Agent Skill', 'Update a system Agent Skill publication.', '078c459f-6fa6-46be-a47d-e657854ebf95'),
('00000000-3854-4000-8000-000000000004', 'object/agentSkill/system/delete', 'Delete System Agent Skill', 'Delete a system Agent Skill publication.', '078c459f-6fa6-46be-a47d-e657854ebf95'),
('00000000-3854-4000-8000-000000000005', 'object/agentSkill/user/create', 'Create User Agent Skill', 'Create a user Agent Skill publication.', '178c459f-6fa6-46be-a47d-e657854ebf95'),
('00000000-3854-4000-8000-000000000006', 'object/agentSkill/user/read', 'Read User Agent Skill', 'Read a user Agent Skill publication.', '178c459f-6fa6-46be-a47d-e657854ebf95'),
('00000000-3854-4000-8000-000000000007', 'object/agentSkill/user/update', 'Update User Agent Skill', 'Update a user Agent Skill publication.', '178c459f-6fa6-46be-a47d-e657854ebf95'),
('00000000-3854-4000-8000-000000000008', 'object/agentSkill/user/delete', 'Delete User Agent Skill', 'Delete a user Agent Skill publication.', '178c459f-6fa6-46be-a47d-e657854ebf95'),
('00000000-3854-4000-8000-000000000009', 'object/agentSkill/install/create', 'Install Agent Skill', 'Create a future recipient Agent Skill installation.', '278c459f-6fa6-46be-a47d-e657854ebf95'),
('00000000-3854-4000-8000-000000000010', 'object/agentSkill/install/read', 'Read Installed Agent Skill', 'Read a future recipient Agent Skill installation.', '278c459f-6fa6-46be-a47d-e657854ebf95'),
('00000000-3854-4000-8000-000000000011', 'object/agentSkill/install/update', 'Update Installed Agent Skill', 'Update future non-identity installation settings.', '278c459f-6fa6-46be-a47d-e657854ebf95'),
('00000000-3854-4000-8000-000000000012', 'object/agentSkill/install/delete', 'Uninstall Agent Skill', 'Delete a future recipient Agent Skill installation.', '278c459f-6fa6-46be-a47d-e657854ebf95');

INSERT INTO "public"."permissions"
("id", "name", "resource_id", "user_ownership_constraint", "org_unit_ownership_constraint", "pre_authorised_constraint", "allow_exemption", "description") VALUES
('00000000-3854-4100-8000-000000000001', 'Read System Agent Skills by Organisation', '078c459f-6fa6-46be-a47d-e657854ebf95', false, true, false, true, 'Read matching-OrgUnit or explicitly exempt system publications.'),
('00000000-3854-4100-8000-000000000002', 'Read Pre-authorised System Agent Skills', '078c459f-6fa6-46be-a47d-e657854ebf95', false, false, true, true, 'Read explicitly pre-authorised or exempt system publications.'),
('00000000-3854-4100-8000-000000000003', 'Manage Own User Agent Skills', '178c459f-6fa6-46be-a47d-e657854ebf95', true, false, false, false, 'Create, read, update and delete owned user publications.'),
('00000000-3854-4100-8000-000000000004', 'Read User Agent Skills by Organisation', '178c459f-6fa6-46be-a47d-e657854ebf95', false, true, false, true, 'Read matching-OrgUnit or explicitly exempt user publications.'),
('00000000-3854-4100-8000-000000000005', 'Read Pre-authorised User Agent Skills', '178c459f-6fa6-46be-a47d-e657854ebf95', false, false, true, true, 'Read explicitly pre-authorised or exempt user publications.'),
('00000000-3854-4100-8000-000000000006', 'Manage Own Installed Agent Skills', '278c459f-6fa6-46be-a47d-e657854ebf95', true, false, false, false, 'Future owner-constrained installation CRUD for #3861.'),
('00000000-3854-4100-8000-000000000007', 'Manage System Agent Skills', '078c459f-6fa6-46be-a47d-e657854ebf95', false, false, false, false, 'Trusted non-global-admin system publication CRUD.');

INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") VALUES
('00000000-3854-4100-8000-000000000001', '00000000-3854-4000-8000-000000000002'),
('00000000-3854-4100-8000-000000000002', '00000000-3854-4000-8000-000000000002'),
('00000000-3854-4100-8000-000000000003', '00000000-3854-4000-8000-000000000005'),
('00000000-3854-4100-8000-000000000003', '00000000-3854-4000-8000-000000000006'),
('00000000-3854-4100-8000-000000000003', '00000000-3854-4000-8000-000000000007'),
('00000000-3854-4100-8000-000000000003', '00000000-3854-4000-8000-000000000008'),
('00000000-3854-4100-8000-000000000004', '00000000-3854-4000-8000-000000000006'),
('00000000-3854-4100-8000-000000000005', '00000000-3854-4000-8000-000000000006'),
('00000000-3854-4100-8000-000000000006', '00000000-3854-4000-8000-000000000009'),
('00000000-3854-4100-8000-000000000006', '00000000-3854-4000-8000-000000000010'),
('00000000-3854-4100-8000-000000000006', '00000000-3854-4000-8000-000000000011'),
('00000000-3854-4100-8000-000000000006', '00000000-3854-4000-8000-000000000012'),
('00000000-3854-4100-8000-000000000007', '00000000-3854-4000-8000-000000000001'),
('00000000-3854-4100-8000-000000000007', '00000000-3854-4000-8000-000000000002'),
('00000000-3854-4100-8000-000000000007', '00000000-3854-4000-8000-000000000003'),
('00000000-3854-4100-8000-000000000007', '00000000-3854-4000-8000-000000000004');

INSERT INTO "public"."resources" ("id", "uri", "name", "description") VALUES
('00000000-3858-4300-8000-000000000001', 'agentWorkspace', 'Agent Workspace', 'The current user''s own Agent Workspace.');

INSERT INTO "public"."operations" ("id", "uri", "name", "description", "resource_id") VALUES
('00000000-3858-4000-8000-000000000001', 'agentWorkspace/access', 'Access Own Agent Workspace', 'Start, use, resume, reset and terminate the current user''s own Agent Workspace.', '00000000-3858-4300-8000-000000000001');

INSERT INTO "public"."permissions"
("id", "name", "resource_id", "user_ownership_constraint", "org_unit_ownership_constraint", "pre_authorised_constraint", "allow_exemption", "description") VALUES
('00000000-3858-4100-8000-000000000001', 'Access Own Agent Workspace', '00000000-3858-4300-8000-000000000001', false, false, false, false, 'Operate the current user''s own Agent Workspace only.');

INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") VALUES
('00000000-3858-4100-8000-000000000001', '00000000-3858-4000-8000-000000000001');

INSERT INTO "public"."roles" ("id", "name", "description") VALUES
('00000000-3854-4200-8000-000000000001', 'Agent Workspace Users', 'Unassigned stock role for own Workspace, publication reads, own user publications and future own installations.'),
('00000000-3854-4200-8000-000000000002', 'Agent Skills Admins', 'Unassigned stock role for trusted system publication management without global administrator access.');

INSERT INTO "public"."role_permissions" ("role_id", "permission_id") VALUES
('00000000-3854-4200-8000-000000000001', '00000000-3854-4100-8000-000000000001'),
('00000000-3854-4200-8000-000000000001', '00000000-3854-4100-8000-000000000002'),
('00000000-3854-4200-8000-000000000001', '00000000-3854-4100-8000-000000000003'),
('00000000-3854-4200-8000-000000000001', '00000000-3854-4100-8000-000000000004'),
('00000000-3854-4200-8000-000000000001', '00000000-3854-4100-8000-000000000005'),
('00000000-3854-4200-8000-000000000001', '00000000-3854-4100-8000-000000000006'),
('00000000-3854-4200-8000-000000000001', '00000000-3858-4100-8000-000000000001'),
('00000000-3854-4200-8000-000000000002', '00000000-3854-4100-8000-000000000007');
