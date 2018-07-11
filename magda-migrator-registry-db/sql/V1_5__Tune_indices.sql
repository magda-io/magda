-- In the future this should be dynamic.
CREATE INDEX recordsaspects_data_distributions_gin_idx
    ON recordaspects USING gin
    ((data -> 'distributions'::text));

CREATE INDEX events_recordid_idx
    ON events USING btree
    ((data ->> 'recordId'::text));

CREATE INDEX events_aspectid_idx
    ON events USING btree
    ((data ->> 'aspectId'::text));