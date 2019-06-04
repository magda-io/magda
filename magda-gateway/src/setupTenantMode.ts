import TenantsLoader from "./reloadTenants";

export var multiTenantsMode: boolean = undefined;
export var magdaAdminPortalName: string = undefined;
export var tenantApi: string = undefined;
export var tenantsLoader: TenantsLoader = undefined;

type Config = {
    tenantApi?: string;
    enableMultiTenants?: boolean;
    magdaAdminPortalName?: string;
    fetchTenantsMinIntervalInMs?: number;
};

export default function setupTenantMode(config: Config) {
    multiTenantsMode = config.enableMultiTenants;
    magdaAdminPortalName = config.magdaAdminPortalName;
    tenantApi = config.tenantApi;
    tenantsLoader = new TenantsLoader(config.fetchTenantsMinIntervalInMs);
}
