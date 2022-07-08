CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.content
(
    id character varying(200) NOT NULL,
    type character varying(200) NOT NULL,
    content text NOT NULL,
    CONSTRAINT content_pkey PRIMARY KEY (id)
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;
