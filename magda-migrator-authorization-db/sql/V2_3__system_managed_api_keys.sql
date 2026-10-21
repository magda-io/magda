-- Add operational metadata for lifecycle-bound credentials created by trusted
-- Magda services (for example the Agent Manager). These remain normal
-- user-scoped API keys for authentication and authorization purposes.
ALTER TABLE "public"."api_keys"
    ADD COLUMN "name" text DEFAULT NULL,
    ADD COLUMN "system_managed" boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "api_keys_user_system_name_idx"
    ON "public"."api_keys" ("user_id", "name")
    WHERE "system_managed" = true;
