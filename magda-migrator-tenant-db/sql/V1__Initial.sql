CREATE SEQUENCE IF NOT EXISTS tenants_id_seq;

CREATE TABLE IF NOT EXISTS tenants (
    domainname character varying(100) PRIMARY KEY,
    id bigint UNIQUE NOT NULL DEFAULT nextval('tenants_id_seq'::regclass),
    enabled boolean DEFAULT false,
    description character varying(1000)
);
