CREATE TABLE "public"."credentials" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" uuid NOT NULL,
    "hash" varchar(60) NOT NULL DEFAULT ''::character varying,
    PRIMARY KEY ("id")
) WITH (
    OIDS = FALSE
);

ALTER TABLE "public"."user_roles" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;