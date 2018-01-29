ALTER TABLE records
    ADD COLUMN sourcetag character varying;

CREATE INDEX records_sourcetag_idx
    ON records (sourcetag);

CREATE INDEX recordaspects_id_idx
    ON recordaspects
    ((data ->> 'id'::text));