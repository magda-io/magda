ALTER TABLE webhooks
    ADD COLUMN lastretrytime timestamptz NULL DEFAULT NULL;

ALTER TABLE webhooks
    ADD COLUMN retrycount integer NOT NULL DEFAULT 0;