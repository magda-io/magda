-- Register the single self-only Agent Workspace operation (#3858).
--
-- `agentWorkspace/access` lets the authenticated user start, inspect, resume,
-- use (DSH runtime HTTP and WebSocket), reset and terminate their **own**
-- Agent Workspace. Agent Manager always derives the target Sandbox from the
-- authenticated user, so the permission never reaches another user's Sandbox.
--
-- The permission is attached only to the unassigned stock role
-- "Agent Workspace Users" seeded by V2_4. It is not granted to Authenticated
-- Users. Global administrators keep access to their own Workspace through the
-- existing entrypoint administrator override. "Agent Skills Admins" does not
-- imply Workspace access.

INSERT INTO "public"."resources" ("id", "uri", "name", "description") VALUES
('00000000-3858-4300-8000-000000000001', 'agentWorkspace', 'Agent Workspace', 'The current user''s own Agent Workspace.');

INSERT INTO "public"."operations" ("id", "uri", "name", "description", "resource_id") VALUES
('00000000-3858-4000-8000-000000000001', 'agentWorkspace/access', 'Access Own Agent Workspace', 'Start, use, resume, reset and terminate the current user''s own Agent Workspace.', '00000000-3858-4300-8000-000000000001');

INSERT INTO "public"."permissions"
("id", "name", "resource_id", "user_ownership_constraint", "org_unit_ownership_constraint", "pre_authorised_constraint", "allow_exemption", "description") VALUES
('00000000-3858-4100-8000-000000000001', 'Access Own Agent Workspace', '00000000-3858-4300-8000-000000000001', false, false, false, false, 'Operate the current user''s own Agent Workspace only.');

INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") VALUES
('00000000-3858-4100-8000-000000000001', '00000000-3858-4000-8000-000000000001');

INSERT INTO "public"."role_permissions" ("role_id", "permission_id") VALUES
('00000000-3854-4200-8000-000000000001', '00000000-3858-4100-8000-000000000001');
