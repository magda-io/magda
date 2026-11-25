-- LLM Services database (#3838): access profiles and the daily token usage
-- ledger. See docs/design/agent-workspace/llm-access-profiles.md (Data model).
--
-- `access_profiles` column names `org_unit_id`, `use_permission_id` and
-- `constraint_exemption` are also the field names of the OPA decision input
-- `input.object.llmAccessProfile` (DATA-1): renaming one needs a policy change
-- in magda-opa/policies/llm/access/allow.rego.

CREATE TABLE "public"."access_profiles" (
    "id" uuid PRIMARY KEY,
    "name" text NOT NULL CHECK (length(btrim("name")) > 0),
    "description" text,
    "allowed_models" text[] NOT NULL CHECK (cardinality("allowed_models") > 0),
    "enabled" boolean NOT NULL DEFAULT true,
    "org_unit_id" uuid,
    "constraint_exemption" boolean NOT NULL DEFAULT false,
    -- The profile's one managed permission (AUTH-7). LLM Services chooses the
    -- ID, inserts the row and creates the permission in one transaction
    -- (LIFE-1), so every row has one.
    "use_permission_id" uuid NOT NULL UNIQUE,
    "allowed_daily_tokens" bigint CHECK ("allowed_daily_tokens" >= 0),
    "allowed_weekly_tokens" bigint CHECK ("allowed_weekly_tokens" >= 0),
    "allowed_monthly_tokens" bigint CHECK ("allowed_monthly_tokens" >= 0),
    "revision" bigint NOT NULL DEFAULT 1 CHECK ("revision" > 0),
    "created_by" uuid,
    "updated_by" uuid,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "access_profiles_name_idx" ON "public"."access_profiles" (lower("name"));

CREATE TABLE "public"."daily_model_usage" (
    "user_id" uuid NOT NULL,
    "model_alias" text NOT NULL,
    "local_date" date NOT NULL,
    "measured_input_tokens" bigint NOT NULL DEFAULT 0 CHECK ("measured_input_tokens" >= 0),
    "measured_output_tokens" bigint NOT NULL DEFAULT 0 CHECK ("measured_output_tokens" >= 0),
    "estimated_tokens" bigint NOT NULL DEFAULT 0 CHECK ("estimated_tokens" >= 0),
    "estimated_requests" bigint NOT NULL DEFAULT 0 CHECK ("estimated_requests" >= 0),
    PRIMARY KEY ("user_id", "model_alias", "local_date")
);
