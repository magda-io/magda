-- Add three permission for control dataset visibility
INSERT INTO "public"."permissions" 
    ("id", "name", "resource_id", "user_ownership_constraint", "org_unit_ownership_constraint", "pre_authorised_constraint", "description") 
VALUES 
('3d913ce7-e728-4bd2-9542-5e9983e45fe1', 'View Draft Dataset', (SELECT id FROM resources WHERE uri = 'object/dataset/draft') , 'f', 'f', 'f', 'This permission allows user to view any Draft dataset (no constraint i.e. whole site)'),
('72d52505-cf96-47b2-9b74-d0fdc1f5aee7', 'View Draft Dataset (Own)', (SELECT id FROM resources WHERE uri = 'object/dataset/draft'), 't', 'f', 'f', 'This permission allows user to view his own Draft dataset only'),
('e5ce2fc4-9f38-4f52-8190-b770ed2074e6', 'View Published Dataset', (SELECT id FROM resources WHERE uri = 'object/dataset/published'), 'f', 'f', 'f', 'This permission allows user to view any published dataset (no constraint)');

-- Add proper operations to permissions
INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") 
VALUES 
('3d913ce7-e728-4bd2-9542-5e9983e45fe1', (SELECT id FROM operations WHERE uri = 'object/dataset/draft/read')),
('72d52505-cf96-47b2-9b74-d0fdc1f5aee7', (SELECT id FROM operations WHERE uri = 'object/dataset/draft/read')),
('e5ce2fc4-9f38-4f52-8190-b770ed2074e6', (SELECT id FROM operations WHERE uri = 'object/dataset/published/read'));

-- Create approver roles
INSERT INTO "public"."roles" ("id", "name", "description") 
VALUES 
('14ff3f57-e8ea-4771-93af-c6ea91a798d5', 'Approvers', 'Users who can publish datasets');

-- Add permissions to different roles
INSERT INTO "public"."role_permissions" ("role_id", "permission_id") 
VALUES 
('00000000-0000-0001-0000-000000000000', 'e5ce2fc4-9f38-4f52-8190-b770ed2074e6'),
('00000000-0000-0002-0000-000000000000', 'e5ce2fc4-9f38-4f52-8190-b770ed2074e6'),
('14ff3f57-e8ea-4771-93af-c6ea91a798d5', 'e5ce2fc4-9f38-4f52-8190-b770ed2074e6'),
('14ff3f57-e8ea-4771-93af-c6ea91a798d5', '72d52505-cf96-47b2-9b74-d0fdc1f5aee7'),
('14ff3f57-e8ea-4771-93af-c6ea91a798d5', '3d913ce7-e728-4bd2-9542-5e9983e45fe1');