CREATE SEQUENCE public.tenants_id_seq;

ALTER SEQUENCE public.tenants_id_seq
    OWNER TO postgres;

GRANT ALL ON SEQUENCE public.tenants_id_seq TO postgres;

GRANT SELECT, USAGE ON SEQUENCE public.tenants_id_seq TO client;

CREATE TABLE IF NOT EXISTS public.Tenants (
    domainName character varying(100) COLLATE pg_catalog."default" NOT NULL,
    id bigint NOT NULL DEFAULT nextval('tenants_id_seq'::regclass),
    enabled boolean DEFAULT false,
    description character varying(1000) COLLATE pg_catalog."default",
    CONSTRAINT tenants_pkey PRIMARY KEY (domainName),
    CONSTRAINT tenants_id_key UNIQUE (id),
    sequence bigserial UNIQUE NOT NULL,
    lastUpdate bigint REFERENCES Events NOT NULL
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.tenants
    OWNER to postgres;

GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE public.tenants TO client;

GRANT ALL ON TABLE public.tenants TO postgres;

INSERT INTO Tenants(domainName, id, enabled, description, lastUpdate) VALUES('initial-website', 0, true, 'Initial entry used for migrating database from single tenant to multi-tenants.', 1);

ALTER TABLE recordaspects DROP CONSTRAINT recordaspects_recordid_fkey;

ALTER TABLE Records ADD COLUMN tenantId bigint;
UPDATE Records SET tenantId = 0 where tenantId is Null;
ALTER TABLE records DROP CONSTRAINT records_pkey;
ALTER TABLE records ADD CONSTRAINT records_pkey PRIMARY KEY (recordid, tenantId);
ALTER TABLE records ADD CONSTRAINT tenantid_fkey FOREIGN KEY (tenantId)
    REFERENCES tenants(id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE NO ACTION;

ALTER TABLE recordaspects ADD COLUMN tenantId bigint;
UPDATE recordaspects SET tenantId = 0 where tenantId is Null;
ALTER TABLE recordaspects DROP CONSTRAINT recordaspects_pkey;
ALTER TABLE recordaspects ADD CONSTRAINT recordaspects_pkey PRIMARY KEY (aspectid, recordid, tenantId);
ALTER TABLE recordaspects ADD CONSTRAINT recordaspects_tenantid_fkey FOREIGN KEY (tenantId)
    REFERENCES tenants(id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE NO ACTION;

INSERT INTO EventTypes (eventTypeId, name) VALUES (10, 'Create Tenant');
