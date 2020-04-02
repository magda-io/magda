import TenantsLoader from "./reloadTenants";

export type TenantConfig = {
    tenantUrl?: string;
    enableMultiTenants?: boolean;
    magdaAdminPortalName?: string;
    minReqIntervalInMs?: number;
    jwtSecret?: string;
    userId?: string;
};

export type TenantMode = {
    multiTenantsMode: boolean;
    magdaAdminPortalName: string;
    tenantsLoader?: TenantsLoader;
};

export default function setupTenantMode(config: TenantConfig): TenantMode {
    return {
        multiTenantsMode: config.enableMultiTenants,
        magdaAdminPortalName: config.magdaAdminPortalName,
        tenantsLoader: config.enableMultiTenants
            ? new TenantsLoader({
                  tenantUrl: config.tenantUrl,
                  jwtSecret: config.jwtSecret,
                  userId: config.userId,
                  minReqIntervalInMs: config.minReqIntervalInMs
              })
            : undefined
    };
}
