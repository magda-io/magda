-- Organisation Unit Tree Structure ---------------------------------------------------
CREATE TABLE "public"."org_units" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "name" varchar(250) NOT NULL DEFAULT ''::character varying,
    "left" int4 NOT NULL,
    "right" int4 NOT NULL,
    "description" text NOT NULL DEFAULT ''::text,
    "create_by" uuid DEFAULT NULL,
    "create_time" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edit_by" uuid DEFAULT NULL,
    "edit_time" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
) WITH (
    OIDS = FALSE
);

-- add index
CREATE INDEX org_units_left_idx ON "public"."org_units" USING btree ("left");
CREATE INDEX org_units_right_idx ON "public"."org_units" USING btree ("right");
CREATE INDEX org_units_left_ight_idx ON "public"."org_units" USING btree ("left", "right");

ALTER TABLE "public"."org_units" ADD FOREIGN KEY ("create_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."org_units" ADD FOREIGN KEY ("edit_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- End Organisation Unit Tree Structure  -------------------------------------------------
-- Add org_unit_id field to user table ---------------------------------------------------
ALTER TABLE "public"."users" ADD COLUMN "orgUnitId" uuid DEFAULT NULL;
ALTER TABLE "public"."users" ADD FOREIGN KEY ("orgUnitId") REFERENCES "public"."org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add one more org unit ownership related permission for control dataset visibility
INSERT INTO "public"."permissions" 
    ("id", "name", "resource_id", "user_ownership_constraint", "org_unit_ownership_constraint", "pre_authorised_constraint", "description") 
VALUES 
('42d5b7ad-6430-4c34-84f4-f8605e0d69da', 'View Draft Dataset (Within Org Unit)', (SELECT id FROM resources WHERE uri = 'object/dataset/draft'), 'f', 't', 'f', 'This permission allows user to view Draft dataset within his org unit only');

-- Add proper operations to created permissions
INSERT INTO "public"."permission_operations" ("permission_id", "operation_id") 
VALUES 
('42d5b7ad-6430-4c34-84f4-f8605e0d69da', (SELECT id FROM operations WHERE uri = 'object/dataset/draft/read'));
