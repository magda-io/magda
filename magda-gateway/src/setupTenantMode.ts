import TenantsLoader from "./reloadTenants";

export var multiTenantsMode: boolean = undefined;
export var magdaAdminPortalName: string = undefined;
export var tenantsLoader: TenantsLoader = undefined;

type Config = {
    tenantUrl?: string, 
    enableMultiTenants?: boolean;
    magdaAdminPortalName?: string;
    minReqIntervalInMs?: number;
    jwtSecret?: string;
    userId?: string;
};

export default function setupTenantMode(config: Config) {
    multiTenantsMode = config.enableMultiTenants;
    magdaAdminPortalName = config.magdaAdminPortalName;

    if (config.enableMultiTenants === true) {
        tenantsLoader = new TenantsLoader({
            tenantUrl: config.tenantUrl, 
            jwtSecret: config.jwtSecret, 
            userId: config.userId, 
            minReqIntervalInMs: config.minReqIntervalInMs
        })
    }
}
