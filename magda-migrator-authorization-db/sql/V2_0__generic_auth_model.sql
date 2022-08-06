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
('object/organization', 'Organization', 'Organization record. It contains the informaiton of an organization who is a dataset publisher or responsible for a dataset.');

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

-- Add resource, operation for access `accessGroups` 
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('object/accessGroup', 'Access Group', 'Access Group Records');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/accessGroup/create','Create Access Group', 'Allow a user to create an access group via `POST /api/v0/auth/accessGroup` API. Once an access group is created, any other operations require relevant record level permission to the `access group` registry record to perform.', (SELECT id FROM resources WHERE uri = 'object/accessGroup')),
('object/accessGroup/read','View Access Group', 'The actual read access is secured via resource operation `object/record/read` over access group registry records. This operation can be used by frontend to determine whether a user has access to `access group` related UI.', (SELECT id FROM resources WHERE uri = 'object/accessGroup'));

-- Add resource, operation for access `storage bucket` 
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('storage/bucket', 'Storage Bucket', 'Storage Bucket');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('storage/bucket/create','Create Bucket', '', (SELECT id FROM resources WHERE uri = 'storage/bucket')),
('storage/bucket/read', 'Read Bucket', '', (SELECT id FROM resources WHERE uri = 'storage/bucket')),
('storage/bucket/update', 'Update Bucket', '', (SELECT id FROM resources WHERE uri = 'storage/bucket')),
('storage/bucket/delete', 'Delete Bucket', '', (SELECT id FROM resources WHERE uri = 'storage/bucket'));

-- Add resource, operation for access `storage object / file` 
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('storage/object', 'Storage Object', 'Storage Object (file)');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('storage/object/read', 'Read Object', '', (SELECT id FROM resources WHERE uri = 'storage/object')),
('storage/object/upload', 'Upload Object', '', (SELECT id FROM resources WHERE uri = 'storage/object')),
('storage/object/delete', 'Delete Object', '', (SELECT id FROM resources WHERE uri = 'storage/object'));

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
('authObject/orgUnit', 'Organizational Unit', 'Organizational Units are used to represent / mirror your organization''s functional or business structure.');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('authObject/orgUnit/create','Create Organization Unit', '', (SELECT id FROM resources WHERE uri = 'authObject/orgUnit')),
('authObject/orgUnit/read', 'Read Organization Unit', '', (SELECT id FROM resources WHERE uri = 'authObject/orgUnit')),
('authObject/orgUnit/update', 'Update Organization Unit', '', (SELECT id FROM resources WHERE uri = 'authObject/orgUnit')),
('authObject/orgUnit/delete', 'Delete Organization Unit', '', (SELECT id FROM resources WHERE uri = 'authObject/orgUnit'));

-- Add resource, operation for access `faas function` 
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('object/faas/function', 'FaaS functions', 'Resource represents FaaS functions');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/faas/function/create','Deploy / Create a FaaS function', 'Allow a user to create / deploy a FaaS function.', (SELECT id FROM resources WHERE uri = 'object/faas/function')),
('object/faas/function/read','Read any information of a FaaS function', 'Allow a user to read information of a FaaS function.', (SELECT id FROM resources WHERE uri = 'object/faas/function')),
('object/faas/function/update','Update a FaaS function', 'Allow a user to update a FaaS function.', (SELECT id FROM resources WHERE uri = 'object/faas/function')),
('object/faas/function/invoke','Invoke a FaaS function', 'Allow a user to invoke a FaaS function.', (SELECT id FROM resources WHERE uri = 'object/faas/function')),
('object/faas/function/delete','Delete a FaaS function', 'Allow a user to delete a FaaS function.', (SELECT id FROM resources WHERE uri = 'object/faas/function'));
-- End adding resource, operation for access `faas function` 

-- Add resource, operation for `content` API 
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('object/content', 'content objects', 'Objects managed by content APIs');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/content/update','Create / update content objects', 'Allow a user to create / update content objects', (SELECT id FROM resources WHERE uri = 'object/content')),
('object/content/read','Read content objects', 'Allow a user to read content objects', (SELECT id FROM resources WHERE uri = 'object/content')),
('object/content/delete','Delete content objects', 'Allow a user to content objects', (SELECT id FROM resources WHERE uri = 'object/content'));
-- End adding resource, operation for `content` API

-- Add resource, operation for `connectors` 
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('object/connector', 'Connectors', 'Resource represents data source connectors');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/connector/create','Create a new connector', 'Allow a user to create a new connector', (SELECT id FROM resources WHERE uri = 'object/connector')),
('object/connector/update','Update a connector', 'Allow a user to update a connector', (SELECT id FROM resources WHERE uri = 'object/connector')),
('object/connector/read','Read connector information', 'Allow a user to read the information of connectors', (SELECT id FROM resources WHERE uri = 'object/connector')),
('object/connector/delete','Delete a connector', 'Allow a user to delete a connector', (SELECT id FROM resources WHERE uri = 'object/connector'));
-- End adding resource, operation for `connectors`

-- Add resource, operation for `multi-tenancy tenants` managed by tenant api
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('object/tenant', 'Tenants', 'Resource represents multi-tenancy tenants');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/tenant/create','Create a new tenant', 'Allow a user to create a new tenant', (SELECT id FROM resources WHERE uri = 'object/tenant')),
('object/tenant/update','Update a tenant', 'Allow a user to update a tenant', (SELECT id FROM resources WHERE uri = 'object/tenant')),
('object/tenant/read','Read tenant information', 'Allow a user to read the information of tenants', (SELECT id FROM resources WHERE uri = 'object/tenant')),
('object/tenant/delete','Delete a tenant', 'Allow a user to delete a tenant', (SELECT id FROM resources WHERE uri = 'object/tenant'));
-- End adding resource, operation for `tenant`

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
('769d99b6-32a1-4f61-b4c0-662e46e94766', 'Distribution Permission with Ownership Constraint', (SELECT id FROM resources WHERE uri = 'object/distribution') , 't', 'f', 'f', 'This permission allows Data Stewards to create, update, view & delete his own distributions.'),
('a45132c8-a43b-41ac-bd83-c9eb0a83be00', 'Orgnisation (Publisher) Permission within Ownership Constraint', (SELECT id FROM resources WHERE uri = 'object/organization') , 't', 'f', 'f', 'This permission allows Data Stewards to create & view orgnisation with ownership constraint.'),
('7293dae6-9235-43ec-ae43-b90c0e89fdee', 'View Draft Datasets within Org Units', (SELECT id FROM resources WHERE uri = 'object/dataset/draft') , 'f', 't', 'f', 'This permission allows Data Stewards to view draft datasets within org units.'),
('45247ef8-68b9-4dab-a5d5-a23143503887', 'View Published Datasets within Org Units', (SELECT id FROM resources WHERE uri = 'object/dataset/published') , 'f', 't', 'f', 'This permission allows Data Stewards to view published datasets within org units.'),
('5f89bd45-899a-4c37-9f71-3da878ad247b', 'View Distribution within Org Units', (SELECT id FROM resources WHERE uri = 'object/distribution') , 'f', 't', 'f', 'This permission allows Data Stewards to view distributions within org units.'),
('6a54f495-bcd0-4474-be12-60e1454aec7e', 'View Orgnisation (Publisher) within Org Units', (SELECT id FROM resources WHERE uri = 'object/organization') , 'f', 't', 'f', 'This permission allows Data Stewards to view orgnisation (publisher) within org units.'),
('60ea27d1-5772-4e11-823d-92f88f927745', 'Read Org Units with own org units', (SELECT id FROM resources WHERE uri = 'authObject/orgUnit') , 'f', 't', 'f', 'This permission allows Data Stewards to read org unit info within his org unit sub tree.'),
('2c1f7e2e-3ff2-460f-95b4-fef8b6698ac1', 'Read / invoke FaaS functions', (SELECT id FROM resources WHERE uri = 'object/faas/function') , 'f', 'f', 'f', 'This permission allows Data Stewards to read / invoke all FaaS functions.');
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
('769d99b6-32a1-4f61-b4c0-662e46e94766', (SELECT id FROM operations WHERE uri = 'object/distribution/create')),
('769d99b6-32a1-4f61-b4c0-662e46e94766', (SELECT id FROM operations WHERE uri = 'object/distribution/update')),
('769d99b6-32a1-4f61-b4c0-662e46e94766', (SELECT id FROM operations WHERE uri = 'object/distribution/read')),
('769d99b6-32a1-4f61-b4c0-662e46e94766', (SELECT id FROM operations WHERE uri = 'object/distribution/delete'));
INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") 
VALUES 
('a45132c8-a43b-41ac-bd83-c9eb0a83be00', (SELECT id FROM operations WHERE uri = 'object/organization/create')),
('a45132c8-a43b-41ac-bd83-c9eb0a83be00', (SELECT id FROM operations WHERE uri = 'object/organization/read'));
INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") 
VALUES 
('7293dae6-9235-43ec-ae43-b90c0e89fdee', (SELECT id FROM operations WHERE uri = 'object/dataset/draft/read'));
INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") 
VALUES 
('45247ef8-68b9-4dab-a5d5-a23143503887', (SELECT id FROM operations WHERE uri = 'object/dataset/published/read'));
INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") 
VALUES 
('5f89bd45-899a-4c37-9f71-3da878ad247b', (SELECT id FROM operations WHERE uri = 'object/distribution/read'));
INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") 
VALUES 
('6a54f495-bcd0-4474-be12-60e1454aec7e', (SELECT id FROM operations WHERE uri = 'object/organization/read'));
INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") 
VALUES 
('60ea27d1-5772-4e11-823d-92f88f927745', (SELECT id FROM operations WHERE uri = 'authObject/orgUnit/read'));
INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") 
VALUES 
('2c1f7e2e-3ff2-460f-95b4-fef8b6698ac1', (SELECT id FROM operations WHERE uri = 'object/faas/function/read')),
('2c1f7e2e-3ff2-460f-95b4-fef8b6698ac1', (SELECT id FROM operations WHERE uri = 'object/faas/function/invoke'));
-- Add permissions to Data Stewards role
INSERT INTO "public"."role_permissions" ("role_id", "permission_id") 
VALUES 
('4154bf84-d36e-4551-9734-4666f5b1e1c0', '1c2e3c8d-b96d-43c0-ac21-4a0481f523a5'),
('4154bf84-d36e-4551-9734-4666f5b1e1c0', '1b3380a8-a888-43f7-bf92-6410e1306c75'),
('4154bf84-d36e-4551-9734-4666f5b1e1c0', '769d99b6-32a1-4f61-b4c0-662e46e94766'),
('4154bf84-d36e-4551-9734-4666f5b1e1c0', 'a45132c8-a43b-41ac-bd83-c9eb0a83be00'),
('4154bf84-d36e-4551-9734-4666f5b1e1c0', '7293dae6-9235-43ec-ae43-b90c0e89fdee'),
('4154bf84-d36e-4551-9734-4666f5b1e1c0', '45247ef8-68b9-4dab-a5d5-a23143503887'),
('4154bf84-d36e-4551-9734-4666f5b1e1c0', '5f89bd45-899a-4c37-9f71-3da878ad247b'),
('4154bf84-d36e-4551-9734-4666f5b1e1c0', '6a54f495-bcd0-4474-be12-60e1454aec7e'),
('4154bf84-d36e-4551-9734-4666f5b1e1c0', '60ea27d1-5772-4e11-823d-92f88f927745'),
('4154bf84-d36e-4551-9734-4666f5b1e1c0', '2c1f7e2e-3ff2-460f-95b4-fef8b6698ac1');
-- end create Data Stewards role

-- START add more permissions to authenticated & anonymous users role
-- Add to anonymous users
INSERT INTO "public"."permissions" 
    ("id", "name", "resource_id", "user_ownership_constraint", "org_unit_ownership_constraint", "pre_authorised_constraint", "description") 
VALUES 
('7a78954f-a776-44b0-8491-2850c8db09bd', 'Read Org Units with own org units', (SELECT id FROM resources WHERE uri = 'authObject/orgUnit') , 'f', 't', 'f', 'This permission allows users to read org unit info within his org unit sub tree.'),
('ce2be273-3db3-4d3b-8a2b-07af346e3187', 'Read Distribution with own org units', (SELECT id FROM resources WHERE uri = 'object/distribution') , 'f', 't', 'f', 'This permission allows users to read distribution info within his org unit sub tree.'),
('adfad193-2f89-432b-9d37-c7a728d9cc92', 'Read Orgnisation (Publisher) with own org units', (SELECT id FROM resources WHERE uri = 'object/organization') , 'f', 't', 'f', 'This permission allows users to read orgnisation (publisher) info within his org unit sub tree.'),
('d768254c-de97-4a1d-b955-53c76187edcf', 'Read content objects', (SELECT id FROM resources WHERE uri = 'object/content') , 'f', 'f', 'f', 'This permission allows users to read content objects.');
INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") 
VALUES 
('7a78954f-a776-44b0-8491-2850c8db09bd', (SELECT id FROM operations WHERE uri = 'authObject/orgUnit/read')),
('ce2be273-3db3-4d3b-8a2b-07af346e3187', (SELECT id FROM operations WHERE uri = 'object/distribution/read')),
('adfad193-2f89-432b-9d37-c7a728d9cc92', (SELECT id FROM operations WHERE uri = 'object/organization/read')),
('d768254c-de97-4a1d-b955-53c76187edcf', (SELECT id FROM operations WHERE uri = 'object/content/read'));
INSERT INTO "public"."role_permissions" ("permission_id", "role_id") 
VALUES 
('7a78954f-a776-44b0-8491-2850c8db09bd', '00000000-0000-0001-0000-000000000000'),
('ce2be273-3db3-4d3b-8a2b-07af346e3187', '00000000-0000-0001-0000-000000000000'),
('adfad193-2f89-432b-9d37-c7a728d9cc92', '00000000-0000-0001-0000-000000000000'),
('d768254c-de97-4a1d-b955-53c76187edcf', '00000000-0000-0001-0000-000000000000');
-- Add to authenticated users
INSERT INTO "public"."permissions" 
    ("id", "name", "resource_id", "user_ownership_constraint", "org_unit_ownership_constraint", "pre_authorised_constraint", "description") 
VALUES 
('b8ca1f22-1faa-4c23-bcc2-c0051df9bccf', 'Read Org Units with own org units', (SELECT id FROM resources WHERE uri = 'authObject/orgUnit') , 'f', 't', 'f', 'This permission allows users to read org unit info within his org unit sub tree.'),
('fe2ea6f1-192a-423c-9ae0-acb9f5d2dc48', 'Read Distribution with own org units', (SELECT id FROM resources WHERE uri = 'object/distribution') , 'f', 't', 'f', 'This permission allows users to read distribution info within his org unit sub tree.'),
('e204f8ca-718b-4a29-bea3-554a4551ed20', 'Read Orgnisation (Publisher) with own org units', (SELECT id FROM resources WHERE uri = 'object/organization') , 'f', 't', 'f', 'This permission allows users to read orgnisation (publisher) info within his org unit sub tree.'),
('d2974d9b-e965-403b-86b4-d5e143be6349', 'Read content objects', (SELECT id FROM resources WHERE uri = 'object/content') , 'f', 'f', 'f', 'This permission allows users to read content objects.');
INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") 
VALUES 
('b8ca1f22-1faa-4c23-bcc2-c0051df9bccf', (SELECT id FROM operations WHERE uri = 'authObject/orgUnit/read')),
('fe2ea6f1-192a-423c-9ae0-acb9f5d2dc48', (SELECT id FROM operations WHERE uri = 'object/distribution/read')),
('e204f8ca-718b-4a29-bea3-554a4551ed20', (SELECT id FROM operations WHERE uri = 'object/organization/read')),
('d2974d9b-e965-403b-86b4-d5e143be6349', (SELECT id FROM operations WHERE uri = 'object/content/read'));
INSERT INTO "public"."role_permissions" ("permission_id", "role_id") 
VALUES 
('b8ca1f22-1faa-4c23-bcc2-c0051df9bccf', '00000000-0000-0002-0000-000000000000'),
('fe2ea6f1-192a-423c-9ae0-acb9f5d2dc48', '00000000-0000-0002-0000-000000000000'),
('e204f8ca-718b-4a29-bea3-554a4551ed20', '00000000-0000-0002-0000-000000000000'),
('d2974d9b-e965-403b-86b4-d5e143be6349', '00000000-0000-0002-0000-000000000000');
-- END add more permissions to authenticated & anonymous users role
-- upgrade api_keys table-- 
ALTER TABLE "public"."api_keys" ADD COLUMN "expiry_time" timestamptz DEFAULT NULL;
ALTER TABLE "public"."api_keys" ADD COLUMN "edit_time" timestamptz DEFAULT NULL;
ALTER TABLE "public"."api_keys" ADD COLUMN "last_successful_attempt_time" timestamptz DEFAULT NULL;
ALTER TABLE "public"."api_keys" ADD COLUMN "last_failed_attempt_time" timestamptz DEFAULT NULL;
ALTER TABLE "public"."api_keys" ADD COLUMN "enabled" boolean default true;
-- end upgrade api_keys table-- 
-- upgrade credentials table--
ALTER TABLE "public"."credentials" ADD COLUMN "expiry_time" timestamptz DEFAULT NULL;
ALTER TABLE "public"."credentials" ADD COLUMN "edit_time" timestamptz DEFAULT NULL;
ALTER TABLE "public"."credentials" ADD COLUMN "last_successful_attempt_time" timestamptz DEFAULT NULL;
ALTER TABLE "public"."credentials" ADD COLUMN "last_failed_attempt_time" timestamptz DEFAULT NULL;
ALTER TABLE "public"."credentials" ADD COLUMN "enabled" boolean default true;
-- end upgrade credentials table-- 
-- add new indexer api resource / operations --
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('api/indexer', 'Indexer APIs', 'represent the access to indexer APIs');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('api/indexer/reindex','the API triggers full proactive reindex', '', (SELECT id FROM resources WHERE uri = 'api/indexer')),
('api/indexer/reindex/in-progress', 'the API gets the progress info of the recent full proactive reindex', '', (SELECT id FROM resources WHERE uri = 'api/indexer')),
('api/indexer/reindex/snapshot','the API triggers snapshot creation', '', (SELECT id FROM resources WHERE uri = 'api/indexer'));
-- end add new indexer api resource / operations --
-- create index for user display name --
CREATE INDEX users_display_name_gin_trgm_idx ON "public"."users" USING gin ("displayName" gin_trgm_ops);
-- end create index for user display name --
