-- Roles & Permissions ---------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE "public"."operations" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "uri" varchar(250) NOT NULL DEFAULT ''::character varying UNIQUE,
    "name" varchar(250) NOT NULL DEFAULT ''::character varying,
    "description" text NOT NULL DEFAULT ''::text,
    "resource_id" uuid NOT NULL,
    PRIMARY KEY ("id")
) WITH (
    OIDS = FALSE
);

CREATE TABLE "public"."permission_operations" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "permission_id" uuid NOT NULL,
    "operation_id" uuid NOT NULL,
    UNIQUE ("permission_id", "operation_id"),
    PRIMARY KEY ("id")
) WITH (
    OIDS = FALSE
);


CREATE TABLE "public"."permissions" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "name" varchar(250) NOT NULL DEFAULT ''::character varying,
    "resource_id" uuid NOT NULL,
    "user_ownership_constraint" bool NOT NULL DEFAULT false,
    "org_unit_ownership_constraint" bool NOT NULL DEFAULT false,
    "pre_authorised_constraint" bool NOT NULL DEFAULT false,
    "description" text NOT NULL DEFAULT ''::text,
    "owner_id" uuid DEFAULT NULL,
    "create_by" uuid DEFAULT NULL,
    "create_time" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edit_by" uuid DEFAULT NULL,
    "edit_time" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
) WITH (
    OIDS = FALSE
);

CREATE TABLE "public"."resources" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "uri" varchar(250) NOT NULL DEFAULT ''::character varying UNIQUE,
    "name" varchar(250) NOT NULL DEFAULT ''::character varying,
    "description" text NOT NULL DEFAULT ''::text,
    PRIMARY KEY ("id")
) WITH (
    OIDS = FALSE
);

CREATE TABLE "public"."role_permissions" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "role_id" uuid NOT NULL,
    "permission_id" uuid NOT NULL,
    UNIQUE ("role_id", "permission_id"),
    PRIMARY KEY ("id")
) WITH (
    OIDS = FALSE
);

CREATE TABLE "public"."roles" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "name" varchar(250) NOT NULL DEFAULT ''::character varying,
    "description" text NOT NULL DEFAULT ''::text,
    "owner_id" uuid DEFAULT NULL,
    -- whether a role is the user's default pre-authorized permissions target containers
    "is_adhoc" bool NOT NULL DEFAULT false,
    "create_by" uuid DEFAULT NULL,
    "create_time" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edit_by" uuid DEFAULT NULL,
    "edit_time" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
) WITH (
    OIDS = FALSE
);

CREATE TABLE "public"."user_roles" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" uuid NOT NULL,
    "role_id" uuid NOT NULL,
    UNIQUE ("role_id", "user_id"),
    PRIMARY KEY ("id")
) WITH (
    OIDS = FALSE
);

ALTER TABLE "public"."operations" ADD FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."permission_operations" ADD FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."permission_operations" ADD FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."permissions" ADD FOREIGN KEY ("edit_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."permissions" ADD FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."permissions" ADD FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."permissions" ADD FOREIGN KEY ("create_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."role_permissions" ADD FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."role_permissions" ADD FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."roles" ADD FOREIGN KEY ("edit_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."roles" ADD FOREIGN KEY ("create_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."roles" ADD FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."user_roles" ADD FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."user_roles" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add index

CREATE INDEX permission_operations_permission_id_idx ON "public"."permission_operations" USING btree ("permission_id");
CREATE INDEX permission_operations_operation_id_idx ON "public"."permission_operations" USING btree ("operation_id");

CREATE INDEX resource_id_idx ON "public"."permissions" USING btree (resource_id);

CREATE INDEX role_permissions_permission_id_idx ON "public"."role_permissions" USING btree ("permission_id");
CREATE INDEX role_permissions_role_id_idx ON "public"."role_permissions" USING btree ("role_id");

CREATE INDEX user_roles_role_id_idx ON "public"."user_roles" USING btree ("role_id");
CREATE INDEX user_roles_user_id_idx ON "public"."user_roles" USING btree ("user_id");

-- Add index for like with leading wildcard %xx%

CREATE INDEX operations_name_gin_trgm_idx ON "public"."operations" USING gin ("name" gin_trgm_ops);
CREATE INDEX operations_uri_gin_trgm_idx ON "public"."operations" USING gin ("uri" gin_trgm_ops);

CREATE INDEX permissions_name_gin_trgm_idx ON "public"."permissions" USING gin ("name" gin_trgm_ops);

CREATE INDEX resources_name_gin_trgm_idx ON "public"."resources" USING gin ("name" gin_trgm_ops);
CREATE INDEX resources_uri_gin_trgm_idx ON "public"."resources" USING gin ("uri" gin_trgm_ops);

CREATE INDEX roles_name_gin_trgm_idx ON "public"."roles" USING gin ("name" gin_trgm_ops);

-- Grant clientUser all permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${clientUserName};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${clientUserName};

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${clientUserName};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${clientUserName};

-- Add default roles
INSERT INTO "public"."roles" ("id", "name", "description", "create_by", "create_time", "edit_by", "edit_time") 
VALUES 
('00000000-0000-0001-0000-000000000000', 'Anonymous Users', 'Default role for unauthenticated users', NULL, '2019-04-04 04:18:41.21616+00', NULL, '2019-04-04 04:18:41.21616+00'),
('00000000-0000-0002-0000-000000000000', 'Authenticated Users', 'Default role for authenticated users', NULL, '2019-04-04 04:20:30.728639+00', NULL, '2019-04-04 04:20:30.728639+00'),
('00000000-0000-0003-0000-000000000000', 'Admin Users', 'Default role for admin users', NULL, '2019-04-04 04:20:54.376504+00', NULL, '2019-04-04 04:20:54.376504+00');

-- Add default roles to the default admin user
INSERT INTO "public"."user_roles" ("user_id", "role_id") 
VALUES 
('00000000-0000-4000-8000-000000000000', '00000000-0000-0002-0000-000000000000'),
('00000000-0000-4000-8000-000000000000', '00000000-0000-0003-0000-000000000000');


-- Default Dataset Resource Operations ---------------------------------------------------

-- Resources & Operations for Draft Dataset
WITH rows AS (
	INSERT INTO "public"."resources" ("uri", "name", "description") 
	VALUES 
	('object/dataset/draft', 'Draft Datasets', 'Datasets in draft status')
	RETURNING id
)
INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/dataset/draft/read','Read Draft Dataset', '', (SELECT id FROM rows)),
('object/dataset/draft/create', 'Create Draft Dataset', '', (SELECT id FROM rows)),
('object/dataset/draft/update', 'Update Draft Dataset', '', (SELECT id FROM rows)),
('object/dataset/draft/delete', 'Delete Draft Dataset', '', (SELECT id FROM rows)),
('object/dataset/draft/publish', 'Publish Draft Dataset', '', (SELECT id FROM rows));

-- Resources & Operations for Published Dataset
WITH rows AS (
	INSERT INTO "public"."resources" ("uri", "name", "description") 
	VALUES 
	('object/dataset/published', 'Published Datasets', 'Datasets in non-draft (published) status')
	RETURNING id
)
INSERT INTO "public"."operations" ("uri", "name", "description", "resource_id") 
VALUES 
('object/dataset/published/unpublish','Unpublish Published Dataset', '', (SELECT id FROM rows)),
('object/dataset/published/read', 'Read Publish Dataset', '', (SELECT id FROM rows));

-- Approver Roles View Permissions ---------------------------------------------------------------------

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

