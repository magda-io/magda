import TenantsLoader from "./reloadTenants";

export var multiTenantsMode: boolean = undefined;
export var magdaAdminPortalName: string = undefined;
export var registryApi: string = undefined;
export var tenantsLoader: TenantsLoader = undefined;

type Config = {
    registryApi?: string;
    enableMultiTenants?: boolean;
    magdaAdminPortalName?: string;
    fetchTenantsMinIntervalInMs?: number;
};

export default function setupTenantMode(config: Config) {
    multiTenantsMode = config.enableMultiTenants;
    magdaAdminPortalName = config.magdaAdminPortalName;
    registryApi = config.registryApi;
    tenantsLoader = new TenantsLoader(config.fetchTenantsMinIntervalInMs);
}
