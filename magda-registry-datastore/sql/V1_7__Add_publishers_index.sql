DROP INDEX IF EXISTS recordsaspects_data_publisheridx;

CREATE INDEX recordsaspects_data_publisheridx
    ON recordaspects USING btree
    ((data ->> 'publisher'::text));