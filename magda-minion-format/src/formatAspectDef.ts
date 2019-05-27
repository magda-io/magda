import { MAGDA_SYSTEM_ID } from "@magda/typescript-common/dist/registry/TenantConsts";

export default {
    id: "dataset-format",
    name: "Details about the format of the distribution",
    jsonSchema: require("@magda/registry-aspects/dataset-format.schema.json"),
    tenantId: MAGDA_SYSTEM_ID
};

export interface FormatAspect {
    format: string;
    confidenceLevel: confidencetype;
    errorDetails?: any;
}

export type confidencetype = number | "unknown";
