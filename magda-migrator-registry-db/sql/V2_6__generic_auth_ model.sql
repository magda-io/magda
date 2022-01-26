-- Add owner_id, creator_id & editor_id field to webhooks table
ALTER TABLE webhooks
ADD COLUMN "owner_id" uuid DEFAULT NULL,
ADD COLUMN "creator_id" uuid DEFAULT NULL,
ADD COLUMN "editor_id" uuid DEFAULT NULL,
ADD COLUMN "create_time" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "edit_time" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX webhooks_owner_id_idx ON webhooks USING btree ("owner_id");
CREATE INDEX webhooks_create_time_idx ON webhooks USING btree ("create_time");
CREATE INDEX webhooks_create_time_idx ON webhooks USING btree ("edit_time");