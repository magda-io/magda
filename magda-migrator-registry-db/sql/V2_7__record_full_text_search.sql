CREATE INDEX idx_data_full_text ON recordaspects 
USING GIN ((
 to_tsvector('english', recordid) ||
 to_tsvector('english', aspectid) ||
 jsonb_to_tsvector('english', data, '["string"]')
))