import { MAGDA_SYSTEM_ID } from "@magda/typescript-common/dist/registry/TenantConsts";

export default {
    id: "source-link-status",
    name: "Details about the downloadURL link status of a distribution",
    jsonSchema: require("@magda/registry-aspects/source-link-status.schema.json"),
    tenantId: MAGDA_SYSTEM_ID
};

export interface BrokenLinkAspect {
    status: RetrieveResult;
    httpStatusCode?: number;
    errorDetails?: any;
}

export type RetrieveResult = "active" | "unknown" | "broken";
