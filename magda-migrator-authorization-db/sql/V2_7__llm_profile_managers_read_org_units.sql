-- Let the "LLM Profile Managers" stock role (V2_6) read org units (#3838).
--
-- A profile's audience is an org unit, so managers must be able to list org
-- units to choose one, and to see the names of the units profiles use. Without
-- an `authObject/orgUnit/read` grant, a manager who isn't an administrator sees
-- no org units at all. The permission is unconstrained and read only: it grants
-- nothing else, and no other `authObject/*` operation.
--
-- The role isn't a protected system role, so an administrator may have deleted
-- it: grant only if it still exists, and don't recreate it.

INSERT INTO "public"."permissions"
("id", "name", "resource_id", "user_ownership_constraint", "org_unit_ownership_constraint", "pre_authorised_constraint", "allow_exemption", "description") VALUES
('00000000-3838-4100-8000-000000000005', 'Read All Org Units for LLM Access Profiles', (SELECT id FROM "public"."resources" WHERE "uri" = 'authObject/orgUnit'), false, false, false, false, 'Read every org unit, to choose and show the audience of LLM access profiles.');

INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") VALUES
('00000000-3838-4100-8000-000000000005', (SELECT id FROM "public"."operations" WHERE "uri" = 'authObject/orgUnit/read'));

INSERT INTO "public"."role_permissions" ("role_id", "permission_id")
SELECT "id", '00000000-3838-4100-8000-000000000005'
FROM "public"."roles"
WHERE "id" = '00000000-3838-4200-8000-000000000001';
