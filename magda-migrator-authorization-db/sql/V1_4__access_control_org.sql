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

ALTER TABLE "public"."org_units" ADD FOREIGN KEY ("create_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."org_units" ADD FOREIGN KEY ("edit_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- End Organisation Unit Tree Structure  -------------------------------------------------
-- Add org_unit_id field to user table ---------------------------------------------------
ALTER TABLE "public"."users" ADD COLUMN "org_unit_id" uuid DEFAULT NULL;
ALTER TABLE "public"."users" ADD FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
