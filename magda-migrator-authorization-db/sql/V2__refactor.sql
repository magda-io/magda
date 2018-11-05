CREATE EXTENSION IF NOT EXISTS "postgres-json-schema";

CREATE TABLE public.policy
(
    id character varying(200) NOT NULL,
    description text,
    statements jsonb NOT NULL CHECK(validate_json_schema($$
    {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resource": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "action": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "allow": {
            "type": "boolean"
          }
        }
      }
    }$$, statements)),
    owner uuid,
    CONSTRAINT users_pkey PRIMARY KEY (id)
)
TABLESPACE pg_default;
