import { MAGDA_SYSTEM_ID } from "@magda/typescript-common/dist/registry/TenantConsts";

export default {
    id: "dataset-linked-data-rating",
    name: "Linked Data Rating",
    jsonSchema: require("@magda/registry-aspects/dataset-linked-data-rating.schema.json"),
    tenantId: MAGDA_SYSTEM_ID
};
