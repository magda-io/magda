ALTER TABLE ONLY users ALTER COLUMN id SET DEFAULT uuid_generate_v4();

CREATE TABLE "public"."credentials" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" uuid NOT NULL,
    "timestamp" timestamp with time zone DEFAULT (now() at time zone 'utc'),
    "hash" varchar(60) NOT NULL DEFAULT ''::character varying,
    UNIQUE ("user_id"),
    PRIMARY KEY ("id")
) WITH (
    OIDS = FALSE
);

ALTER TABLE "public"."credentials" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;