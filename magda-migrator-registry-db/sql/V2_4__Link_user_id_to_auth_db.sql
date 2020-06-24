CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE events
    DROP CONSTRAINT events_userid_fkey;

ALTER TABLE webhooks
	DROP CONSTRAINT webhooks_userid_fkey;

DROP TABLE users;

ALTER TABLE events
    DROP COLUMN userid;

ALTER TABLE webhooks
    DROP COLUMN userid;

ALTER TABLE events
    ADD COLUMN userid uuid;