-- add `allowExemption` field to permission table
ALTER TABLE "public"."permissions"
ADD COLUMN "allowExemption" bool NOT NULL DEFAULT false;

-- Set `allowExemption` to true for permission `View Published Dataset (Org Unit Constraint)`
-- This permission has been assigned to authenticated users & anonymous users roles
UPDATE "public"."permissions" SET "allowExemption" = true WHERE "id" = 'e5ce2fc4-9f38-4f52-8190-b770ed2074e6';

-- Set `allowExemption` to true for permission `Read Published Distribution with own org units`
-- This permission has been assigned to anonymous users roles
UPDATE "public"."permissions" SET "allowExemption" = true WHERE "id" = 'ce2be273-3db3-4d3b-8a2b-07af346e3187';

-- Set `allowExemption` to true for permission `Read Orgnisation (Publisher) with own org units`
-- This permission has been assigned to anonymous users roles
UPDATE "public"."permissions" SET "allowExemption" = true WHERE "id" = 'adfad193-2f89-432b-9d37-c7a728d9cc92';

-- Set `allowExemption` to true for permission `Read Published Distribution with own org units`
-- This permission has been assigned to authenticated users
UPDATE "public"."permissions" SET "allowExemption" = true WHERE "id" = 'fe2ea6f1-192a-423c-9ae0-acb9f5d2dc48';

-- Set `allowExemption` to true for permission `Read Orgnisation (Publisher) with own org units`
-- This permission has been assigned to authenticated users
UPDATE "public"."permissions" SET "allowExemption" = true WHERE "id" = 'e204f8ca-718b-4a29-bea3-554a4551ed20';

