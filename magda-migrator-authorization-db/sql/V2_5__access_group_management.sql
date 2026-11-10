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
-- Only permissions that match what the API created are touched (see below).
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

-- Member roles. A permission is converted or removed only if it is exactly what the
-- access group API created:
-- - its name and description are the API's, and the role the API created for the
--   same group (described as `auto-created for access group <the group ID>`) holds it;
-- - the record read is on `object/record`, pre-authorised, with no ownership or org
--   unit constraint, and has exactly one operation, `object/record/read`;
-- - the UI read is on `object/accessGroup`, unconstrained, and has exactly one
--   operation, `object/accessGroup/read`.
-- Lookalikes that don't qualify are left unchanged and reported with a notice.
-- (The group records, which hold the permission IDs, are in the registry's database,
-- out of this migration's reach.)

DO $$
DECLARE
    record_read_ids uuid[];
    ui_read_ids uuid[];
    skipped record;
BEGIN
    SELECT coalesce(array_agg(p."id"), '{}') INTO record_read_ids
    FROM "public"."permissions" p
    WHERE p."name" = 'System managed for access group'
      AND p."resource_id" = (SELECT id FROM "public"."resources" WHERE "uri" = 'object/record')
      AND p."user_ownership_constraint" = false
      AND p."org_unit_ownership_constraint" = false
      AND p."pre_authorised_constraint" = true
      AND (SELECT count(*) FROM "public"."permission_operations" po WHERE po."permission_id" = p."id") = 1
      AND EXISTS (
          SELECT 1 FROM "public"."permission_operations" po
          WHERE po."permission_id" = p."id"
            AND po."operation_id" = (SELECT id FROM "public"."operations" WHERE "uri" = 'object/record/read'))
      AND EXISTS (
          SELECT 1 FROM "public"."role_permissions" rp
          JOIN "public"."roles" r ON r."id" = rp."role_id"
          WHERE rp."permission_id" = p."id"
            AND r."description" = 'auto-created for access group '
                || substring(p."description" FROM '^Auto-created access group record permission for access group (.+)\.$'));

    SELECT coalesce(array_agg(p."id"), '{}') INTO ui_read_ids
    FROM "public"."permissions" p
    WHERE p."name" = 'System managed for access group'
      AND p."resource_id" = (SELECT id FROM "public"."resources" WHERE "uri" = 'object/accessGroup')
      AND p."user_ownership_constraint" = false
      AND p."org_unit_ownership_constraint" = false
      AND p."pre_authorised_constraint" = false
      AND (SELECT count(*) FROM "public"."permission_operations" po WHERE po."permission_id" = p."id") = 1
      AND EXISTS (
          SELECT 1 FROM "public"."permission_operations" po
          WHERE po."permission_id" = p."id"
            AND po."operation_id" = (SELECT id FROM "public"."operations" WHERE "uri" = 'object/accessGroup/read'))
      AND EXISTS (
          SELECT 1 FROM "public"."role_permissions" rp
          JOIN "public"."roles" r ON r."id" = rp."role_id"
          WHERE rp."permission_id" = p."id"
            AND r."description" = 'auto-created for access group '
                || substring(p."description" FROM '^Auto-created access group UI permission for access group (.+)\.$'));

    -- The pre-authorised record read becomes a pre-authorised typed read, keeping its
    -- ID, so the group records need no change.
    UPDATE "public"."permission_operations"
    SET "operation_id" = (SELECT id FROM "public"."operations" WHERE "uri" = 'object/accessGroup/read')
    WHERE "permission_id" = ANY (record_read_ids);

    UPDATE "public"."permissions"
    SET "resource_id" = (SELECT id FROM "public"."resources" WHERE "uri" = 'object/accessGroup')
    WHERE "id" = ANY (record_read_ids);

    -- The unconstrained UI-only read is removed.
    DELETE FROM "public"."role_permissions" WHERE "permission_id" = ANY (ui_read_ids);
    DELETE FROM "public"."permission_operations" WHERE "permission_id" = ANY (ui_read_ids);
    DELETE FROM "public"."permissions" WHERE "id" = ANY (ui_read_ids);

    RAISE NOTICE 'V2_5: converted % access group record permission(s) and removed % access group UI permission(s).',
        cardinality(record_read_ids), cardinality(ui_read_ids);

    FOR skipped IN
        SELECT p."id", p."description"
        FROM "public"."permissions" p
        WHERE p."name" = 'System managed for access group'
          AND (p."description" LIKE 'Auto-created access group record permission for access group %'
               OR p."description" LIKE 'Auto-created access group UI permission for access group %')
          AND NOT (p."id" = ANY (record_read_ids))
        ORDER BY p."id"
    LOOP
        RAISE NOTICE 'V2_5: left permission % ("%") unchanged: it does not match the permission the access group API created for a member role.',
            skipped."id", skipped."description";
    END LOOP;
END $$;

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
