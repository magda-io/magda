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

-- full id index for history lookup
CREATE INDEX index_policy_id ON public.policy (id);

-- serial index for update lookup
CREATE INDEX index_policy_serial ON public.policy (serial);

-- partial id index to get latest state
CREATE INDEX index_policy_id_latest ON public.policy (id) WHERE nextSerial = -1 AND deleted = false;

--------------------------

CREATE TABLE public.group
(
    id character varying(200) NOT NULL CHECK (id ~* '^[A-Za-z0-9_-]+$'),
    description text,
    policy character varying(200)[],
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

-- full id index for history lookup
CREATE INDEX index_group_id ON public.group (id);

-- serial index for update lookup
CREATE INDEX index_group_serial ON public.group (serial);

-- partial id index to get latest state
CREATE INDEX index_group_id_latest ON public.group (id) WHERE nextSerial = -1 AND deleted = false;


--------------------------

ALTER TABLE public.users
  ADD policy character varying(200)[],
  ADD groups character varying(200)[];

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

  -------------------------------
  -- Insert new data
  -------------------------------

INSERT INTO public.users ("id", "displayName", email, "photoURL", source, "sourceId", "isAdmin")
VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'visitor', 'visitor@visitor.com', '', '', '', false);
