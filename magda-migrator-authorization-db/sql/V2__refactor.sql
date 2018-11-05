-------------------------------
-- Make new table changes
-------------------------------

CREATE TABLE public.policy
(
    id character varying(200) NOT NULL CHECK (id ~* '^[A-Z0-9_-]+$'),
    description text,
    statements jsonb NOT NULL,
    -- history
    serial       bigserial,
    time         timestamptz NOT NULL DEFAULT NOW(),
    nextSerial   bigint DEFAULT -1,
    "user"       uuid NOT NULL,
    deleted      boolean NOT NULL DEFAULT FALSE,
  	"comments"   text DEFAULT NULL
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

-- partial index to get latest state
CREATE INDEX index_policy_id_latest
	ON public.policy (id)
  WHERE nextSerial = -1;

CREATE INDEX index_policy_id_index
  ON public.policy (id);

--------------------------

CREATE TABLE public.group
(
    id character varying(200) NOT NULL CHECK (id ~* '^[A-Za-z0-9_-]+$'),
    description text,
    policy character varying(200)[],
    CONSTRAINT group_pkey PRIMARY KEY (id)
    -- history
    serial       bigserial,
    time         timestamptz NOT NULL DEFAULT NOW(),
    nextSerial   bigint DEFAULT -1,
    "user"       uuid NOT NULL,
    deleted      boolean NOT NULL DEFAULT FALSE,
  	"comments"   text DEFAULT NULL
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

-- partial index to get latest state
CREATE INDEX index_group_id_latest
	ON public.group (id)
  WHERE nextSerial = -1;

CREATE INDEX index_group_id_index
  ON public.group (id);

--------------------------

ALTER TABLE public.users
  ADD policy character varying(200)[],
  ADD groups character varying(200)[];

-------------------------------
-- Insert new data
-------------------------------


-------------------------------
-- Migrate old data
-------------------------------

INSERT INTO public.policy(id, description, statements, "user")
VALUES ('ALL', 'Full System Read and Write', '[
    {
        "resource": ["*"],
        "action": ["create", "read", "update", "delete"],
        "allow": true
    }
]', '00000000-0000-4000-8000-000000000000');

  -- CHECK(validate_json_schema($$
  -- {
  --   "type": "array",
  --   "items": {
  --     "type": "object",
  --     "properties": {
  --       "resource": {
  --         "type": "array",
  --         "items": {
  --           "type": "string"
  --         }
  --       },
  --       "action": {
  --         "type": "array",
  --         "items": {
  --           "type": "string"
  --         }
  --       },
  --       "allow": {
  --         "type": "boolean"
  --       }
  --     }
  --   }
  -- }$$, statements))
