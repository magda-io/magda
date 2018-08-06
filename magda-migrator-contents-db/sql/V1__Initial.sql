CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.contents
(
    id string NOT NULL,
    content text NOT NULL,
    CONSTRAINT contents_pkey PRIMARY KEY (id)
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;
