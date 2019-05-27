import { MAGDA_ADMIN_PORTAL_ID } from "@magda/typescript-common/src/registry/TenantConsts";

export default {
    id: "dataset-quality-rating",
    name: "Data Quality Rating",
    jsonSchema: require("@magda/registry-aspects/dataset-quality-rating.schema.json"),
    tenantId: MAGDA_ADMIN_PORTAL_ID
};
