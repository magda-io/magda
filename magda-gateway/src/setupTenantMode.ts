import { Tenant } from "@magda/typescript-common/dist/generated/registry/api";
import updateTenants from "./updateTenants";

// TODO: Investigate how to use swagger codegen to automatically generate these constants.
// These constants are the same as defined in the scala model Registry.
export const MAGDA_TENANT_ID_HEADER = "X-Magda-TenantId";
export const MAGDA_ADMIN_PORTAL_ID = 0;

export const tenantsTable = new Map<String, Tenant>();
export var multiTenantsMode: boolean = undefined;
export var magdaAdminPortalName: string = undefined;
export var registryApi: string = undefined;

type Config = {
    registryApi?: string;
    enableMultiTenants?: boolean;
    magdaAdminPortalName?: string;
};

export default function setupTenantMode(config: Config) {
    multiTenantsMode = config.enableMultiTenants;
    magdaAdminPortalName = config.magdaAdminPortalName;
    registryApi = config.registryApi;
}
