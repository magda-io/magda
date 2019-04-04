-- Add three permission for control dataset visibility
INSERT INTO "public"."permissions" ("id", "name", "resource_id", "user_ownership_constraint", "org_unit_ownership_constraint", "pre_authorised_constraint", "description", "create_by", "create_time", "edit_by", "edit_time") 
VALUES 
('3d913ce7-e728-4bd2-9542-5e9983e45fe1', 'View Draft Dataset', '1', 'f', 'f', 'f', 'This permission allows user to view any Draft dataset (no constraint i.e. whole site)', NULL, '2019-04-04 05:43:52.177373+00', NULL, '2019-04-04 05:43:52.177373+00'),
('72d52505-cf96-47b2-9b74-d0fdc1f5aee7', 'View Draft Dataset (Own)', '1', 't', 'f', 'f', 'This permission allows user to view his own Draft dataset only', NULL, '2019-04-04 05:38:24.933154+00', NULL, '2019-04-04 05:38:24.933154+00'),
('e5ce2fc4-9f38-4f52-8190-b770ed2074e6', 'View Published Dataset', '2', 'f', 'f', 'f', 'This permission allows user to view any published dataset (no constraint)', NULL, '2019-04-04 05:45:29.896187+00', NULL, '2019-04-04 05:45:29.896187+00');

-- Add proper operations to permissions
INSERT INTO "public"."permission_operations" ("id", "permission_id", "operation_id") 
VALUES 
('023bc1b8-d91b-49fc-8190-ea76bc4b5447', '3d913ce7-e728-4bd2-9542-5e9983e45fe1', '1'),
('87e5041f-5eea-43ef-ba48-8e55f4a5373e', 'e5ce2fc4-9f38-4f52-8190-b770ed2074e6', '9'),
('b53daf02-4421-4109-8d19-7f326ea70f9f', '72d52505-cf96-47b2-9b74-d0fdc1f5aee7', '1');

-- Create approver roles
INSERT INTO "public"."roles" ("id", "name", "description", "create_by", "create_time", "edit_by", "edit_time") 
VALUES 
('14ff3f57-e8ea-4771-93af-c6ea91a798d5', 'Approvers', 'Users who can publish datasets', NULL, '2019-04-04 05:55:29.789774+00', NULL, '2019-04-04 05:55:29.789774+00');

-- Add permissions to different roles
INSERT INTO "public"."role_permissions" ("id", "role_id", "permission_id") 
VALUES 
('746423a1-cf8a-4ec1-9ff4-207285bd5174', '00000000-0000-0001-0000-000000000000', 'e5ce2fc4-9f38-4f52-8190-b770ed2074e6'),
('ab50d5f6-1820-4729-a858-942abc038124', '00000000-0000-0002-0000-000000000000', 'e5ce2fc4-9f38-4f52-8190-b770ed2074e6'),
('ace3314e-63c1-4595-9027-0f7c55e05ef6', '14ff3f57-e8ea-4771-93af-c6ea91a798d5', 'e5ce2fc4-9f38-4f52-8190-b770ed2074e6'),
('c7c1a9b1-9092-4c4b-af27-f53a487d2909', '14ff3f57-e8ea-4771-93af-c6ea91a798d5', '72d52505-cf96-47b2-9b74-d0fdc1f5aee7'),
('f5536bd9-4e91-4c96-a174-02c42e1cc52d', '14ff3f57-e8ea-4771-93af-c6ea91a798d5', '3d913ce7-e728-4bd2-9542-5e9983e45fe1');