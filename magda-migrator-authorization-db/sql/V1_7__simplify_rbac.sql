ALTER TABLE "public"."operations" DROP FOREIGN KEY ("resource_id");
ALTER TABLE "public"."operations" DROP ("resource_id");

ALTER TABLE "public"."permissions" DROP FOREIGN KEY ("resource_id");
ALTER TABLE "public"."permissions" DROP ("resource_id");
ALTER TABLE "public"."permissions" DROP ("user_ownership_constraint");
ALTER TABLE "public"."permissions" DROP ("org_unit_ownership_constraint");
ALTER TABLE "public"."permissions" DROP ("pre_authorised_constraint");

DROP TABLE "public"."resources";

