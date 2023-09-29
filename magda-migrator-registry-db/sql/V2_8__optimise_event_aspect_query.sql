-- this will make planner to use gin index for distributions rather than seq scan
-- event web hook processing will be much faster
CREATE INDEX recordsaspects_data_distributions_gin_with_aspect_cond_idx
    ON recordaspects USING gin
    ((data -> 'distributions'::text))
    WHERE data -> 'aspectId'::text = 'dataset-distributions';