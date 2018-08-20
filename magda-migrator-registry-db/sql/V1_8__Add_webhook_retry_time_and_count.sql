ALTER TABLE webhooks
    ADD COLUMN lastretytime timestamptz NULL DEFAULT NULL;

ALTER TABLE webhooks
    ADD COLUMN retrycount integer NOT NULL DEFAULT 0;