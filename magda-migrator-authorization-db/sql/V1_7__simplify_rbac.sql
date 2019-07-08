ALTER TABLE "public"."operations" DROP CONSTRAINT "operations_resource_id_fkey";
ALTER TABLE "public"."operations" DROP "resource_id";

ALTER TABLE "public"."permissions" DROP CONSTRAINT "permissions_resource_id_fkey";
ALTER TABLE "public"."permissions" DROP "resource_id";
ALTER TABLE "public"."permissions" DROP "user_ownership_constraint";
ALTER TABLE "public"."permissions" DROP "org_unit_ownership_constraint";
ALTER TABLE "public"."permissions" DROP "pre_authorised_constraint";

DROP TABLE "public"."resources";

INSERT INTO permissions (name, description) VALUES ('Create Registry Record', 'Allows the user to create a record/record aspect in the registry');
INSERT INTO permissions (name, description) VALUES ('Read Registry Record', 'Allows the user to read a record/record aspect in the registry');
INSERT INTO permissions (name, description) VALUES ('Update Registry Record', 'Allows the user to update a record/record aspect in the registry');
INSERT INTO permissions (name, description) VALUES ('Delete Registry Record', 'Allows the user to delete a record/record aspect in the registry');

INSERT INTO operations (uri, name) VALUES ('object/registry/record/create', 'Create registry record/aspect');
INSERT INTO operations (uri, name) VALUES ('object/registry/record/read', 'Read registry record/aspect');
INSERT INTO operations (uri, name) VALUES ('object/registry/record/update', 'Update registry record/aspect');
INSERT INTO operations (uri, name) VALUES ('object/registry/record/delete', 'Delete registry record/aspect');

INSERT INTO permission_operations (permission_id, operation_id) VALUES (
    (SELECT id FROM permissions WHERE name='Create Registry Record'), (SELECT id FROM operations WHERE uri='object/record/create') 
);
INSERT INTO permission_operations (permission_id, operation_id) VALUES (
    (SELECT id FROM permissions WHERE name='Read Registry Record'), (SELECT id FROM operations WHERE uri='object/record/read') 
);
INSERT INTO permission_operations (permission_id, operation_id) VALUES (
    (SELECT id FROM permissions WHERE name='Update Registry Record'), (SELECT id FROM operations WHERE uri='object/record/update') 
);
INSERT INTO permission_operations (permission_id, operation_id) VALUES (
    (SELECT id FROM permissions WHERE name='Delete Registry Record'), (SELECT id FROM operations WHERE uri='object/record/delete') 
);

INSERT INTO role_permissions (role_id, permission_id) VALUES (
    (SELECT id FROM roles WHERE name='Anonymous Users'), (SELECT id FROM permissions WHERE name='Read Registry Record')
);
INSERT INTO role_permissions (role_id, permission_id) VALUES (
    (SELECT id FROM roles WHERE name='Authenticated Users'), (SELECT id FROM permissions WHERE name='Read Registry Record')
);

INSERT INTO role_permissions (role_id, permission_id) VALUES (
    (SELECT id FROM roles WHERE name='Admin Users'), (SELECT id FROM permissions WHERE name='Create Registry Record')
);
INSERT INTO role_permissions (role_id, permission_id) VALUES (
    (SELECT id FROM roles WHERE name='Admin Users'), (SELECT id FROM permissions WHERE name='Update Registry Record')
);
INSERT INTO role_permissions (role_id, permission_id) VALUES (
    (SELECT id FROM roles WHERE name='Admin Users'), (SELECT id FROM permissions WHERE name='Delete Registry Record')
);
