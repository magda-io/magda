-- In the future this should be dynamic.
CREATE INDEX reports_data_gin_idx
    ON recordaspects USING gin
    ((data -> 'distributions'::text));

CREATE INDEX events_recordid_idx
    ON events USING btree
    ((data ->> 'recordId'::text));

CREATE INDEX events_aspectid_idx
    ON events USING btree
    ((data ->> 'aspectId'::text));
