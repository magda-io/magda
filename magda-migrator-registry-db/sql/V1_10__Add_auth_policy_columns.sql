ALTER TABLE recordaspects
    ADD COLUMN authPolicyRead character varying NOT NULL DEFAULT 'object.registry.aspect.base.read'::character varying;
CREATE INDEX recordaspects_authpolicyread_idx
    ON recordaspects USING btree(authPolicyRead);

ALTER TABLE recordaspects
    ADD COLUMN authPolicyUpdate character varying NOT NULL DEFAULT 'object.registry.aspect.base.update'::character varying;
CREATE INDEX recordaspects_authpolicyupdate_idx
    ON recordaspects USING btree(authPolicyUpdate);

ALTER TABLE recordaspects
    ADD COLUMN authPolicyDelete character varying NOT NULL DEFAULT 'object.registry.aspect.base.delete'::character varying;
CREATE INDEX recordaspects_authpolicydelete_idx
    ON recordaspects USING btree(authPolicyDelete);

UPDATE aspects SET aspectid='access-control' WHERE aspectid='dataset-access-control';
UPDATE recordaspects SET aspectid='access-control' WHERE aspectid='dataset-access-control';

ALTER TABLE recordaspects ALTER COLUMN authPolicyRead DROP DEFAULT;
ALTER TABLE recordaspects ALTER COLUMN authPolicyUpdate DROP DEFAULT;
ALTER TABLE recordaspects ALTER COLUMN authPolicyDelete DROP DEFAULT;