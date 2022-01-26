-- Add owner_id, creator_id & editor_id field to webhooks table
ALTER TABLE webhooks
ADD COLUMN ownerId uuid DEFAULT NULL,
ADD COLUMN creatorId uuid DEFAULT NULL,
ADD COLUMN editorId uuid DEFAULT NULL,
ADD COLUMN createTime timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN editTime timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX webhooks_owner_id_idx ON webhooks USING btree (ownerId);
CREATE INDEX webhooks_create_time_idx ON webhooks USING btree (createTime);
CREATE INDEX webhooks_create_time_idx ON webhooks USING btree (editTime);