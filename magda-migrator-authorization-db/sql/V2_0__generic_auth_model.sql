-- Add default org unit root node if not exists
INSERT INTO "public"."org_units" ("name", "left", "right")
SELECT 'Default Root', 1, 2
WHERE NOT EXISTS (
	SELECT 1 FROM "public"."org_units" WHERE "left" = 1
);

-- remove obsolete resource `registry/record` & relevant records defined in schema v1.7
DELETE FROM role_permissions
WHERE permission_id IN (
	SELECT permissions.id 
	FROM permissions 
	LEFT JOIN resources ON resources.id = permissions.resource_id
	WHERE resources.uri = 'registry/record'
);

DELETE FROM permission_operations
WHERE operation_id IN (
    SELECT id FROM operations WHERE uri LIKE 'object/registry/record/%'
);

DELETE FROM permissions
WHERE id IN (
	SELECT permissions.id 
	FROM permissions 
	LEFT JOIN resources ON resources.id = permissions.resource_id
	WHERE resources.uri = 'registry/record'
);

DELETE FROM operations WHERE uri LIKE 'object/registry/record/%';
DELETE FROM resources WHERE uri = 'registry/record';
-- end remove obsolete resource `registry/record`

-- update default role setup
-- remove approver role for now to avoid confusion as approval process is still in development
DELETE FROM role_permissions WHERE role_id = '14ff3f57-e8ea-4771-93af-c6ea91a798d5';
DELETE FROM roles WHERE id = '14ff3f57-e8ea-4771-93af-c6ea91a798d5';
-- remove unused view data permission (no constrant) created in schema version 1.3
DELETE FROM role_permissions WHERE permission_id = '3d913ce7-e728-4bd2-9542-5e9983e45fe1';
DELETE FROM permission_operations WHERE permission_id = '3d913ce7-e728-4bd2-9542-5e9983e45fe1';
DELETE FROM permissions WHERE id = '3d913ce7-e728-4bd2-9542-5e9983e45fe1';
-- remove unused view data permission (owner constrant) created in schema version 1.3
DELETE FROM role_permissions WHERE permission_id = '72d52505-cf96-47b2-9b74-d0fdc1f5aee7';
DELETE FROM permission_operations WHERE permission_id = '72d52505-cf96-47b2-9b74-d0fdc1f5aee7';
DELETE FROM permissions WHERE id = '72d52505-cf96-47b2-9b74-d0fdc1f5aee7';
-- remove unused View Draft Dataset (Within Org Unit) created in schema version 1.5
DELETE FROM role_permissions WHERE permission_id = '42d5b7ad-6430-4c34-84f4-f8605e0d69da';
DELETE FROM permission_operations WHERE permission_id = '42d5b7ad-6430-4c34-84f4-f8605e0d69da';
DELETE FROM permissions WHERE id = '42d5b7ad-6430-4c34-84f4-f8605e0d69da';
-- remove 'object/dataset/published/updateLicenseInfo' defined in schema version 1.3
DELETE FROM permission_operations
WHERE operation_id IN (
    SELECT id FROM operations WHERE uri = 'object/dataset/published/updateLicenseInfo'
);
DELETE FROM operations WHERE uri = 'object/dataset/published/updateLicenseInfo';
-- remove 'object/dataset/published/updateNonLicenseInfo' defined in schema version 1.3
DELETE FROM permission_operations
WHERE operation_id IN (
    SELECT id FROM operations WHERE uri = 'object/dataset/published/updateNonLicenseInfo'
);
DELETE FROM operations WHERE uri = 'object/dataset/published/updateNonLicenseInfo';
-- update View Published Dataset with Org Unit Constraint permission created in schema version 1.3
UPDATE permissions 
SET "name" = 'View Published Dataset (Org Unit Constraint)', 
    "user_ownership_constraint" = 'f', 
    "org_unit_ownership_constraint" = 't', 
    "pre_authorised_constraint" = 'f'
WHERE "id" = 'e5ce2fc4-9f38-4f52-8190-b770ed2074e6';

-- Add create, update & delete published dataset records
INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/dataset/published/publish', 'Publish Changes', '', (SELECT id FROM resources WHERE uri = 'object/dataset/published')),
('object/dataset/published/create','Create Published Dataset', '', (SELECT id FROM resources WHERE uri = 'object/dataset/published')),
('object/dataset/published/update', 'Update Published Dataset', '', (SELECT id FROM resources WHERE uri = 'object/dataset/published')),
('object/dataset/published/delete', 'Delete Published Dataset', '', (SELECT id FROM resources WHERE uri = 'object/dataset/published'));

-- Add resource, operation for access generic `record`
-- If a user has permissins to generic `record` type, he will access to all record types e.g. dataset, distributions, orgnisation etc.
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('object/record', 'Records', 'A generic concept represents all types of records. Any other derived record types (e.g. datasets) can be considered as generic records with certian aspect data attached. Grant permissions to this resources will allow a user to access any specialized type records (e.g. dataset)');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/record/create','Create Record', '', (SELECT id FROM resources WHERE uri = 'object/record')),
('object/record/read', 'Read Record', '', (SELECT id FROM resources WHERE uri = 'object/record')),
('object/record/update', 'Update Record', '', (SELECT id FROM resources WHERE uri = 'object/record')),
('object/record/delete', 'Delete Record', '', (SELECT id FROM resources WHERE uri = 'object/record'));

-- Add resource, operation for access `aspect` definition
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('object/aspect', 'Aspect Definition', 'Aspect definition item');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/aspect/create','Create Aspect Definition', '', (SELECT id FROM resources WHERE uri = 'object/aspect')),
('object/aspect/read', 'Read Aspect Definition', '', (SELECT id FROM resources WHERE uri = 'object/aspect')),
('object/aspect/update', 'Update Aspect Definition', '', (SELECT id FROM resources WHERE uri = 'object/aspect')),
('object/aspect/delete', 'Delete Aspect Definition', '', (SELECT id FROM resources WHERE uri = 'object/aspect'));

-- Add resource, operation for access `distribution` records
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('object/distribution', 'Distributions', 'Distribution records.');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/distribution/create','Create Distribution', '', (SELECT id FROM resources WHERE uri = 'object/distribution')),
('object/distribution/read', 'Read Distribution', '', (SELECT id FROM resources WHERE uri = 'object/distribution')),
('object/distribution/update', 'Update Distribution', '', (SELECT id FROM resources WHERE uri = 'object/distribution')),
('object/distribution/delete', 'Delete Distribution', '', (SELECT id FROM resources WHERE uri = 'object/distribution'));

-- Add resource, operation for access `organization` record
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('object/organization', 'Organization', 'Organization record');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/organization/create','Create Organization Record', '', (SELECT id FROM resources WHERE uri = 'object/organization')),
('object/organization/read', 'Read Organization Record', '', (SELECT id FROM resources WHERE uri = 'object/organization')),
('object/organization/update', 'Update Organization Record', '', (SELECT id FROM resources WHERE uri = 'object/organization')),
('object/organization/delete', 'Delete Organization Record', '', (SELECT id FROM resources WHERE uri = 'object/organization'));

-- Add resource, operation for access `webhooks` 
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('object/webhook', 'Webhook', 'Registry Webhook');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/webhook/create','Create Webhook Record', '', (SELECT id FROM resources WHERE uri = 'object/webhook')),
('object/webhook/read', 'Read Webhook Record', '', (SELECT id FROM resources WHERE uri = 'object/webhook')),
('object/webhook/update', 'Update Webhook Record', '', (SELECT id FROM resources WHERE uri = 'object/webhook')),
('object/webhook/delete', 'Delete Webhook Record', '', (SELECT id FROM resources WHERE uri = 'object/webhook')),
('object/webhook/ack', 'Acknowledge a previously-deferred webhook notification processing', '', (SELECT id FROM resources WHERE uri = 'object/webhook'));

-- Add resource, operation for access `events` 
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('object/event', 'Event', 'Registry record events');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/event/create','Create Event Record', '', (SELECT id FROM resources WHERE uri = 'object/event')),
('object/event/read', 'Read Event Record', '', (SELECT id FROM resources WHERE uri = 'object/event')),
('object/event/update', 'Update Event Record', '', (SELECT id FROM resources WHERE uri = 'object/event')),
('object/event/delete', 'Delete Event Record', '', (SELECT id FROM resources WHERE uri = 'object/event'));

-- Add resource, operation for access `apiKey` 
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('authObject/apiKey', 'API Keys', 'API keys that is used to programmatically access Magda APIs on behalf of a user');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('authObject/apiKey/create','Create API key', '', (SELECT id FROM resources WHERE uri = 'authObject/apiKey')),
('authObject/apiKey/read', 'Read API key', '', (SELECT id FROM resources WHERE uri = 'authObject/apiKey')),
('authObject/apiKey/update', 'Update API key', '', (SELECT id FROM resources WHERE uri = 'authObject/apiKey')),
('authObject/apiKey/delete', 'Delete API key', '', (SELECT id FROM resources WHERE uri = 'authObject/apiKey'));

-- Add resource, operation for access `credential` 
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('authObject/credential', 'User Credentials', 'User credentials that are used by the optional `magda-auth-internal` plugin for authenticating users');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('authObject/credential/create','Create Credentials', '', (SELECT id FROM resources WHERE uri = 'authObject/credential')),
('authObject/credential/read', 'Read Credentials', '', (SELECT id FROM resources WHERE uri = 'authObject/credential')),
('authObject/credential/update', 'Update Credentials', '', (SELECT id FROM resources WHERE uri = 'authObject/credential')),
('authObject/credential/delete', 'Delete Credentials', '', (SELECT id FROM resources WHERE uri = 'authObject/credential'));

-- Add resource, operation for access `resource` 
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('authObject/resource', 'resource auth object', 'Any objects that can be an operation target.');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('authObject/resource/create','Create Resource', '', (SELECT id FROM resources WHERE uri = 'authObject/resource')),
('authObject/resource/read', 'Read Resource', '', (SELECT id FROM resources WHERE uri = 'authObject/resource')),
('authObject/resource/update', 'Update Resource', '', (SELECT id FROM resources WHERE uri = 'authObject/resource')),
('authObject/resource/delete', 'Delete Resource', '', (SELECT id FROM resources WHERE uri = 'authObject/resource'));

-- Add resource, operation for access `operation` 
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('authObject/operation', 'operation auth object', 'Any possible actions that users might request to perform on `resources`.');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('authObject/operation/create','Create Operation', '', (SELECT id FROM resources WHERE uri = 'authObject/operation')),
('authObject/operation/read', 'Read Operation', '', (SELECT id FROM resources WHERE uri = 'authObject/operation')),
('authObject/operation/update', 'Update Operation', '', (SELECT id FROM resources WHERE uri = 'authObject/operation')),
('authObject/operation/delete', 'Delete Operation', '', (SELECT id FROM resources WHERE uri = 'authObject/operation'));


-- Add resource, operation for access `permission` 
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('authObject/permission', 'permission auth object', 'A record presents the permission that allow users to perform an operation.');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('authObject/permission/create','Create Permission', '', (SELECT id FROM resources WHERE uri = 'authObject/permission')),
('authObject/permission/read', 'Read Permission', '', (SELECT id FROM resources WHERE uri = 'authObject/permission')),
('authObject/permission/update', 'Update Permission', '', (SELECT id FROM resources WHERE uri = 'authObject/permission')),
('authObject/permission/delete', 'Delete Permission', '', (SELECT id FROM resources WHERE uri = 'authObject/permission'));

-- Add resource, operation for access `role` 
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('authObject/role', 'role auth object', 'A container of a list of permissions. A role can be assigned to a user to grant him all permissions that are contained by the role.');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('authObject/role/create','Create Role', '', (SELECT id FROM resources WHERE uri = 'authObject/role')),
('authObject/role/read', 'Read Role', '', (SELECT id FROM resources WHERE uri = 'authObject/role')),
('authObject/role/update', 'Update Role', '', (SELECT id FROM resources WHERE uri = 'authObject/role')),
('authObject/role/delete', 'Delete Role', '', (SELECT id FROM resources WHERE uri = 'authObject/role'));

-- Add resource, operation for access `user` 
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('authObject/user', 'User Record', 'User record.');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('authObject/user/create','Create User', '', (SELECT id FROM resources WHERE uri = 'authObject/user')),
('authObject/user/read', 'Read User', '', (SELECT id FROM resources WHERE uri = 'authObject/user')),
('authObject/user/update', 'Update User', '', (SELECT id FROM resources WHERE uri = 'authObject/user')),
('authObject/user/delete', 'Delete User', '', (SELECT id FROM resources WHERE uri = 'authObject/user'));

-- Add resource, operation for access `orgUnit` 
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('authObject/orgUnit', 'Organization Unit auth object', 'The organization unit that a record or a user might belong to.');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('authObject/orgUnit/create','Create Organization Unit', '', (SELECT id FROM resources WHERE uri = 'authObject/orgUnit')),
('authObject/orgUnit/read', 'Read Organization Unit', '', (SELECT id FROM resources WHERE uri = 'authObject/orgUnit')),
('authObject/orgUnit/update', 'Update Organization Unit', '', (SELECT id FROM resources WHERE uri = 'authObject/orgUnit')),
('authObject/orgUnit/delete', 'Delete Organization Unit', '', (SELECT id FROM resources WHERE uri = 'authObject/orgUnit'));

-- create Data Stewards role
INSERT INTO "public"."roles" ("id", "name", "description") 
VALUES 
('4154bf84-d36e-4551-9734-4666f5b1e1c0', 'Data Stewards', 'Users who create & manage datatsets.');
-- Add Draft Dataset permission (with owner constraint) to Data Stewards role
-- including Create Draft Dataset, Update Draft Dataset, Read Draft Dataset, Delete Draft Dataset (all with owner constraint)
INSERT INTO "public"."permissions" 
    ("id", "name", "resource_id", "user_ownership_constraint", "org_unit_ownership_constraint", "pre_authorised_constraint", "description") 
VALUES 
('1c2e3c8d-b96d-43c0-ac21-4a0481f523a5', 'Draft Dataset Permission with Ownership Constraint', (SELECT id FROM resources WHERE uri = 'object/dataset/draft') , 't', 'f', 'f', 'This permission allows Data Stewards to create, update, view & delete his own draft datasets.'),
('1b3380a8-a888-43f7-bf92-6410e1306c75', 'Published Dataset Permission with Ownership Constraint', (SELECT id FROM resources WHERE uri = 'object/dataset/published') , 't', 'f', 'f', 'This permission allows Data Stewards to create, update, view & delete his own published datasets.'),
('7293dae6-9235-43ec-ae43-b90c0e89fdee', 'View Draft Datasets within Org Units', (SELECT id FROM resources WHERE uri = 'object/dataset/draft') , 'f', 't', 'f', 'This permission allows Data Stewards to view draft datasets within org units.'),
('45247ef8-68b9-4dab-a5d5-a23143503887', 'View Published Datasets within Org Units', (SELECT id FROM resources WHERE uri = 'object/dataset/published') , 'f', 't', 'f', 'This permission allows Data Stewards to view published datasets within org units.');
-- Add proper operations to permissions above
INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") 
VALUES 
('1c2e3c8d-b96d-43c0-ac21-4a0481f523a5', (SELECT id FROM operations WHERE uri = 'object/dataset/draft/create')),
('1c2e3c8d-b96d-43c0-ac21-4a0481f523a5', (SELECT id FROM operations WHERE uri = 'object/dataset/draft/update')),
('1c2e3c8d-b96d-43c0-ac21-4a0481f523a5', (SELECT id FROM operations WHERE uri = 'object/dataset/draft/read')),
('1c2e3c8d-b96d-43c0-ac21-4a0481f523a5', (SELECT id FROM operations WHERE uri = 'object/dataset/draft/delete'));
INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") 
VALUES 
('1b3380a8-a888-43f7-bf92-6410e1306c75', (SELECT id FROM operations WHERE uri = 'object/dataset/published/create')),
('1b3380a8-a888-43f7-bf92-6410e1306c75', (SELECT id FROM operations WHERE uri = 'object/dataset/published/update')),
('1b3380a8-a888-43f7-bf92-6410e1306c75', (SELECT id FROM operations WHERE uri = 'object/dataset/published/read')),
('1b3380a8-a888-43f7-bf92-6410e1306c75', (SELECT id FROM operations WHERE uri = 'object/dataset/published/delete'));
INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") 
VALUES 
('7293dae6-9235-43ec-ae43-b90c0e89fdee', (SELECT id FROM operations WHERE uri = 'object/dataset/draft/read'));
INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") 
VALUES 
('45247ef8-68b9-4dab-a5d5-a23143503887', (SELECT id FROM operations WHERE uri = 'object/dataset/published/read'));
-- Add permissions to Data Stewards role
INSERT INTO "public"."role_permissions" ("role_id", "permission_id") 
VALUES 
('4154bf84-d36e-4551-9734-4666f5b1e1c0', '1c2e3c8d-b96d-43c0-ac21-4a0481f523a5'),
('4154bf84-d36e-4551-9734-4666f5b1e1c0', '1b3380a8-a888-43f7-bf92-6410e1306c75'),
('4154bf84-d36e-4551-9734-4666f5b1e1c0', '7293dae6-9235-43ec-ae43-b90c0e89fdee'),
('4154bf84-d36e-4551-9734-4666f5b1e1c0', '45247ef8-68b9-4dab-a5d5-a23143503887');
-- end create Data Stewards role