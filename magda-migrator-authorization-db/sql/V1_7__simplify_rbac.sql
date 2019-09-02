INSERT INTO resources (name, description, uri) VALUES ('a registry record resource', 'The uri is a compatibility placeholder. Its value is not important.', 'registry/record');

INSERT INTO permissions (name, description, resource_id) VALUES ('Create Registry Record', 'Allows the user to create a record/record aspect in the registry', (SELECT id FROM resources WHERE uri='registry/record'));
INSERT INTO permissions (name, description, resource_id) VALUES ('Read Registry Record', 'Allows the user to read a record/record aspect in the registry', (SELECT id FROM resources WHERE uri='registry/record'));
INSERT INTO permissions (name, description, resource_id) VALUES ('Update Registry Record', 'Allows the user to update a record/record aspect in the registry', (SELECT id FROM resources WHERE uri='registry/record'));
INSERT INTO permissions (name, description, resource_id) VALUES ('Delete Registry Record', 'Allows the user to delete a record/record aspect in the registry', (SELECT id FROM resources WHERE uri='registry/record'));

INSERT INTO operations (uri, name, resource_id) VALUES ('object/registry/record/create', 'Create registry record/aspect', (SELECT id FROM resources WHERE uri='registry/record'));
INSERT INTO operations (uri, name, resource_id) VALUES ('object/registry/record/read', 'Read registry record/aspect', (SELECT id FROM resources WHERE uri='registry/record'));
INSERT INTO operations (uri, name, resource_id) VALUES ('object/registry/record/update', 'Update registry record/aspect',(SELECT id FROM resources WHERE uri='registry/record'));
INSERT INTO operations (uri, name, resource_id) VALUES ('object/registry/record/delete', 'Delete registry record/aspect', (SELECT id FROM resources WHERE uri='registry/record'));

INSERT INTO permission_operations (permission_id, operation_id) VALUES (
    (SELECT id FROM permissions WHERE name='Create Registry Record'), (SELECT id FROM operations WHERE uri='object/registry/record/create')
);
INSERT INTO permission_operations (permission_id, operation_id) VALUES (
    (SELECT id FROM permissions WHERE name='Read Registry Record'), (SELECT id FROM operations WHERE uri='object/registry/record/read')
);
INSERT INTO permission_operations (permission_id, operation_id) VALUES (
    (SELECT id FROM permissions WHERE name='Update Registry Record'), (SELECT id FROM operations WHERE uri='object/registry/record/update')
);
INSERT INTO permission_operations (permission_id, operation_id) VALUES (
    (SELECT id FROM permissions WHERE name='Delete Registry Record'), (SELECT id FROM operations WHERE uri='object/registry/record/delete')
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
