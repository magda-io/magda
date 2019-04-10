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
