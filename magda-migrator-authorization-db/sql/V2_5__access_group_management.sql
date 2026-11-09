-- Typed access group operations (MAGDA v8) and the "Access Group Managers" role.
--
-- Access groups are now authorised with typed `object/accessGroup/*` operations:
-- `read` a group record, `update` it (rename, members, member list, datasets) and
-- `delete` it, in addition to the existing `create`. Generic `object/record/*` grants
-- no longer authorise reading or managing a group. Group records are written only
-- by the access group API.
--
-- Existing member roles are converted in place. The access group API gave each
-- record group's member role two "System managed for access group" permissions:
-- - a pre-authorised `object/record/read`, listed in the group record's
--   `preAuthorisedPermissionIds`: it becomes a pre-authorised
--   `object/accessGroup/read`, keeping its ID, so the group records need no change;
-- - an unconstrained `object/accessGroup/read`, used only to show the UI: it is
--   removed, since an unconstrained typed read would cover every group.
-- Both are identified by the exact name and description prefix the API used.
-- Agent Skill share groups never had them and are not touched.
--
-- The stock role "Access Group Managers" lets its holders create groups and read,
-- update and delete the groups they own. It is deliberately unassigned.
--
-- IDs: resource and operation IDs are looked up through their unique `uri`;
-- the role and permission IDs are fixed, as in V2_4.

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id")
VALUES
('object/accessGroup/update', 'Update Access Group', 'Rename an access group, change its description or keywords, add or remove its members, list its members, and add or remove its datasets (which also needs `object/record/update` on the dataset).', (SELECT id FROM "public"."resources" WHERE "uri" = 'object/accessGroup')),
('object/accessGroup/delete', 'Delete Access Group', 'Delete an access group.', (SELECT id FROM "public"."resources" WHERE "uri" = 'object/accessGroup'));

UPDATE "public"."operations"
SET "description" = 'Create an access group via `POST /api/v0/auth/accessGroups`. With an ownership constraint, the new group must be owned by the user; with an org unit constraint, it must belong to an org unit the user manages.'
WHERE "uri" = 'object/accessGroup/create';

UPDATE "public"."operations"
SET "description" = 'Read an access group record. Group members get it as a pre-authorised permission. Holding any `object/accessGroup/read` permission also shows the access group UI.'
WHERE "uri" = 'object/accessGroup/read';

-- Member roles: the pre-authorised record read becomes a pre-authorised typed read.

UPDATE "public"."permission_operations" po
SET "operation_id" = (SELECT id FROM "public"."operations" WHERE "uri" = 'object/accessGroup/read')
FROM "public"."permissions" p
WHERE po."permission_id" = p."id"
  AND p."name" = 'System managed for access group'
  AND p."description" LIKE 'Auto-created access group record permission for access group %'
  AND p."pre_authorised_constraint" = true
  AND po."operation_id" = (SELECT id FROM "public"."operations" WHERE "uri" = 'object/record/read');

UPDATE "public"."permissions"
SET "resource_id" = (SELECT id FROM "public"."resources" WHERE "uri" = 'object/accessGroup')
WHERE "name" = 'System managed for access group'
  AND "description" LIKE 'Auto-created access group record permission for access group %'
  AND "pre_authorised_constraint" = true;

-- Member roles: remove the unconstrained UI-only read.

DELETE FROM "public"."role_permissions" WHERE "permission_id" IN (
    SELECT "id" FROM "public"."permissions"
    WHERE "name" = 'System managed for access group'
      AND "description" LIKE 'Auto-created access group UI permission for access group %'
      AND "user_ownership_constraint" = false
      AND "org_unit_ownership_constraint" = false
      AND "pre_authorised_constraint" = false
);
DELETE FROM "public"."permission_operations" WHERE "permission_id" IN (
    SELECT "id" FROM "public"."permissions"
    WHERE "name" = 'System managed for access group'
      AND "description" LIKE 'Auto-created access group UI permission for access group %'
      AND "user_ownership_constraint" = false
      AND "org_unit_ownership_constraint" = false
      AND "pre_authorised_constraint" = false
);
DELETE FROM "public"."permissions"
WHERE "name" = 'System managed for access group'
  AND "description" LIKE 'Auto-created access group UI permission for access group %'
  AND "user_ownership_constraint" = false
  AND "org_unit_ownership_constraint" = false
  AND "pre_authorised_constraint" = false;

-- The stock "Access Group Managers" role

INSERT INTO "public"."permissions"
("id", "name", "resource_id", "user_ownership_constraint", "org_unit_ownership_constraint", "pre_authorised_constraint", "allow_exemption", "description") VALUES
('00000000-3854-4100-8000-000000000010', 'Manage Own Access Groups', (SELECT id FROM "public"."resources" WHERE "uri" = 'object/accessGroup'), true, false, false, false, 'Create access groups, and read, update and delete the access groups the user owns.');

INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") VALUES
('00000000-3854-4100-8000-000000000010', (SELECT id FROM "public"."operations" WHERE "uri" = 'object/accessGroup/create')),
('00000000-3854-4100-8000-000000000010', (SELECT id FROM "public"."operations" WHERE "uri" = 'object/accessGroup/read')),
('00000000-3854-4100-8000-000000000010', (SELECT id FROM "public"."operations" WHERE "uri" = 'object/accessGroup/update')),
('00000000-3854-4100-8000-000000000010', (SELECT id FROM "public"."operations" WHERE "uri" = 'object/accessGroup/delete'));

INSERT INTO "public"."roles" ("id", "name", "description") VALUES
('00000000-3854-4200-8000-000000000003', 'Access Group Managers', 'Unassigned stock role to create access groups and manage the access groups the user owns.');

INSERT INTO "public"."role_permissions" ("role_id", "permission_id") VALUES
('00000000-3854-4200-8000-000000000003', '00000000-3854-4100-8000-000000000010');
