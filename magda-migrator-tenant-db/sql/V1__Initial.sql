CREATE SEQUENCE IF NOT EXISTS tenants_id_seq;

CREATE TABLE IF NOT EXISTS public.tenants (
    domainname character varying(100) PRIMARY KEY,
    id bigint UNIQUE NOT NULL DEFAULT nextval('tenants_id_seq'::regclass),
    enabled boolean DEFAULT false
)
WITH (
    OIDS = FALSE
)

TABLESPACE pg_default;

DO
$body$
BEGIN
    IF NOT EXISTS (
        SELECT                       -- SELECT list can stay empty for this
        FROM   pg_catalog.pg_user
        WHERE  usename = '${clientUserName}') THEN
            CREATE USER ${clientUserName} WITH PASSWORD '${clientPassword}';
   END IF;
END
$body$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${clientUserName};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${clientUserName};

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${clientUserName};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${clientUserName};
