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

CREATE TABLE public.linkeddiscussions
(
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    "linkedId" character varying(200) COLLATE pg_catalog."default" NOT NULL,
    "discussionId" uuid NOT NULL,
    "linkedType" character varying(200) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT linkeddiscussions_pkey PRIMARY KEY (id),
    CONSTRAINT "linkUnique" UNIQUE ("linkedId", "linkedType"),
    CONSTRAINT "linkeddiscussions_discussionId_fkey" FOREIGN KEY ("discussionId")
        REFERENCES public.discussions (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.linkeddiscussions
    OWNER to postgres;

-- Index: x

-- DROP INDEX public.x;

CREATE INDEX x
    ON public.linkeddiscussions USING btree
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
