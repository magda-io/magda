CREATE TABLE public.extra_input
(
    id text COLLATE pg_catalog."default" NOT NULL,
    data jsonb,
    CONSTRAINT extra_input_pkey PRIMARY KEY (id)
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;
