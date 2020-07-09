CREATE TABLE "public"."api_keys" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" uuid NOT NULL,
    "timestamp" timestamp with time zone DEFAULT (now() at time zone 'utc'),
    "hash" varchar(60) NOT NULL DEFAULT ''::character varying,
    PRIMARY KEY ("id")
) WITH (
    OIDS = FALSE
);

ALTER TABLE "public"."api_keys" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;