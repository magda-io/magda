CREATE SEQUENCE IF NOT EXISTS tenants_id_seq;

CREATE TABLE IF NOT EXISTS Tenants (
    domainName character varying(100) PRIMARY KEY,
    id bigint UNIQUE NOT NULL DEFAULT nextval('tenants_id_seq'::regclass),
    enabled boolean DEFAULT false,
    description character varying(1000),
    lastUpdate bigint REFERENCES Events NOT NULL
);

INSERT INTO Tenants(domainName, id, enabled, description, lastUpdate) VALUES('A built-in id.', 0, true, 'Initial entry used for migrating database from single tenant to multi-tenants.', 1);

ALTER TABLE recordaspects DROP CONSTRAINT recordaspects_aspectid_fkey;
ALTER TABLE aspects DROP CONSTRAINT aspects_pkey;
ALTER TABLE aspects ADD COLUMN tenantId bigint;
UPDATE aspects SET tenantId = 0 WHERE tenantId IS NULL;
ALTER TABLE aspects ADD CONSTRAINT aspects_pkey PRIMARY KEY (aspectid, tenantId);

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
ALTER TABLE recordaspects ADD CONSTRAINT recordaspects_aspectid_tenantid_fkey FOREIGN KEY (aspectId, tenantId)
    REFERENCES aspects(aspectid, tenantId) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE NO ACTION;
ALTER TABLE recordaspects ADD CONSTRAINT recordaspects_recordid_tenantid_fkey FOREIGN KEY (recordId, tenantId)
    REFERENCES records(recordId, tenantId) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE NO ACTION;

INSERT INTO EventTypes (eventTypeId, name) VALUES (10, 'Create Tenant');

ALTER TABLE events ADD COLUMN tenantId bigint;
UPDATE events SET tenantId = 0 where tenantId is Null;
ALTER TABLE events ADD CONSTRAINT events_tenantid_fkey FOREIGN KEY (tenantId)
    REFERENCES tenants(id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE NO ACTION;
