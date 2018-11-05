-------------------------------
-- Make new table changes
-------------------------------

CREATE TABLE public.policy
(
    id character varying(200) NOT NULL CHECK (id ~* '^[A-Z0-9_-]+$'),
    description text,
    statements jsonb NOT NULL,
    owner uuid,
    CONSTRAINT policy_pkey PRIMARY KEY (id)
)
TABLESPACE pg_default;

CREATE TABLE public.group
(
    id character varying(200) NOT NULL CHECK (id ~* '^[A-Z0-9_-]+$'),
    description text,
    policy character varying(200)[],
    CONSTRAINT group_pkey PRIMARY KEY (id)
)
TABLESPACE pg_default;

ALTER TABLE public.users
  ADD policy character varying(200)[],
  ADD groups character varying(200)[];

-------------------------------
-- Insert new data
-------------------------------


-------------------------------
-- Migrate old data
-------------------------------

INSERT INTO public.policy(id, description, statements, owner)
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
