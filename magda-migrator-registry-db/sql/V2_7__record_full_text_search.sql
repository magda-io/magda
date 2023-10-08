-- create index for record full text search 
CREATE INDEX idx_data_full_text ON recordaspects 
USING GIN (jsonb_to_tsvector('english'::regconfig, data, '["string"]'))