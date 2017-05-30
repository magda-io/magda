
CREATE DATABASE discussions
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.utf8'
    LC_CTYPE = 'en_US.utf8'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1;

\connect discussions

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.discussions
(
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    CONSTRAINT discussions_pkey PRIMARY KEY (id)
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.discussions
    OWNER to postgres;

CREATE TABLE public.datasetdiscussions
(
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    "datasetId" character varying(200) COLLATE pg_catalog."default" NOT NULL,
    "discussionId" uuid NOT NULL,
    CONSTRAINT datasetdiscussions_pkey PRIMARY KEY (id),
    CONSTRAINT "datasetdiscussions_discussionId_fkey" FOREIGN KEY ("discussionId")
        REFERENCES public.discussions (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;
ALTER TABLE public.datasetdiscussions
    OWNER to postgres;

CREATE INDEX x
    ON public.datasetdiscussions USING btree
    ("discussionId")
    TABLESPACE pg_default;

CREATE TABLE public.messages
(
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    message json NOT NULL,
    "userId" uuid NOT NULL,
    "discussionId" uuid NOT NULL,
    modified timestamp without time zone NOT NULL DEFAULT now(),
    created timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT discussionmessages_pkey PRIMARY KEY (id),
    CONSTRAINT "messages_discussionId_fkey" FOREIGN KEY ("discussionId")
        REFERENCES public.discussions (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.messages
    OWNER to postgres;

-- Index: discussionId

-- DROP INDEX public."discussionId";

CREATE INDEX "discussionId"
    ON public.messages USING btree
    ("discussionId")
    TABLESPACE pg_default;