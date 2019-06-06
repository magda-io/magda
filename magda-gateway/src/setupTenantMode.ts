import TenantsLoader from "./reloadTenants";

export var multiTenantsMode: boolean = undefined;
export var magdaAdminPortalName: string = undefined;
export var tenantUrl: string = undefined;
export var tenantsLoader: TenantsLoader = undefined;

type Config = {
    tenantUrl?: string, 
    enableMultiTenants?: boolean;
    magdaAdminPortalName?: string;
    fetchTenantsMinIntervalInMs?: number;
    jwtScret?: string, 
    userId?: string,  
};

export default function setupTenantMode(config: Config) {
    multiTenantsMode = config.enableMultiTenants;
    magdaAdminPortalName = config.magdaAdminPortalName;
    tenantUrl = config.tenantUrl;
    tenantsLoader = new TenantsLoader(config.tenantUrl, config.jwtScret, config.userId, config.fetchTenantsMinIntervalInMs);
}
