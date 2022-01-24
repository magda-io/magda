-- mark resource `registry/record` as depreciated
UPDATE public.resources
SET "name" = CONCAT('(depreciated) ',"name"), "description" = 'this resource is depreciated and will be removed in future versions'
WHERE "uri" = 'registry/record';


-- Add create, update & delete published dataset records
INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/dataset/published/create','Create Published Dataset', '', (SELECT id FROM resources WHERE uri = 'object/dataset/published')),
('object/dataset/published/update', 'Update Published Dataset', '', (SELECT id FROM resources WHERE uri = 'object/dataset/published')),
('object/dataset/published/delete', 'Delete Published Dataset', '', (SELECT id FROM resources WHERE uri = 'object/dataset/published'));

INSERT INTO "public"."permissions" 
    ("name", "resource_id", "user_ownership_constraint", "org_unit_ownership_constraint", "pre_authorised_constraint", "description") 
VALUES 
('Create Published Dataset', (SELECT id FROM resources WHERE uri = 'object/dataset/published') , 'f', 'f', 'f', 'This permission allows user to create published dataset record'),
('Update Published Dataset', (SELECT id FROM resources WHERE uri = 'object/dataset/published'), 't', 'f', 'f', 'This permission allows user to update published dataset record'),
('Delete Published Dataset', (SELECT id FROM resources WHERE uri = 'object/dataset/published'), 'f', 'f', 'f', 'This permission allows user to delete published dataset record');

-- Add resource, operation for access generic `record`
-- If a user has permissins to generic `record` type, he will access to all record types e.g. dataset, distributions, orgnisation etc.
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('object/record', 'Records', 'A generic concept represents all types of records. Any other derived record types (e.g. datasets) can be considered as generic records with certian aspect data attached.');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/record/create','Create Record', '', (SELECT id FROM resources WHERE uri = 'object/record')),
('object/record/read', 'Read Record', '', (SELECT id FROM resources WHERE uri = 'object/record')),
('object/record/update', 'Update Record', '', (SELECT id FROM resources WHERE uri = 'object/record')),
('object/record/delete', 'Delete Record', '', (SELECT id FROM resources WHERE uri = 'object/record'));

-- Add resource, operation for access `aspect` record
INSERT INTO "public"."resources" 
    ("uri", "name", "description")
VALUES 
('object/aspect', 'Aspects', 'Aspect definition record.');

INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/aspect/create','Create Record', '', (SELECT id FROM resources WHERE uri = 'object/aspect')),
('object/aspect/read', 'Read Record', '', (SELECT id FROM resources WHERE uri = 'object/aspect')),
('object/aspect/update', 'Update Record', '', (SELECT id FROM resources WHERE uri = 'object/aspect')),
('object/aspect/delete', 'Delete Record', '', (SELECT id FROM resources WHERE uri = 'object/aspect'));

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