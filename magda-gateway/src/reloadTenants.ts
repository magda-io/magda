require("isomorphic-fetch");
import { throttle, Cancelable } from "lodash"
import {Tenant} from "@magda/typescript-common/dist/tenant-api/Tenant"
import AuthorizedTenantClient from "@magda/typescript-common/dist/tenant-api/AuthorizedTenantClient"

export const tenantsTable = new Map<String, Tenant>();

let tenantApiClient: AuthorizedTenantClient;
 
async function updateTenants(){
    const tenants = <Tenant[]> await tenantApiClient.getTenants();
    tenantsTable.clear();
    tenants.forEach(t => {
        if (t.enabled === true) {
            tenantsTable.set(t.domainname.toLowerCase(), t);
            console.debug(`${t.domainname.toLowerCase()} : ${t.id}`);
        }
    });
}

type TenantsLoaderConfig = {
    tenantUrl: string;
    jwtSecret: string;
    userId: string;
    minReqIntervalInMs?: number;
}

export default class TenantsLoader {
    private throttledReloadTenants: (() => Promise<void>) & Cancelable;

    constructor(config: TenantsLoaderConfig){
        console.debug(`TenantsLoader throttle interval = ${config.minReqIntervalInMs}`);
        tenantApiClient = new AuthorizedTenantClient({
            urlStr: config.tenantUrl,
            userId: config.userId,
            jwtSecret: config.jwtSecret
        })
        
        const throttleInterval = config.minReqIntervalInMs || 600000;
        this.throttledReloadTenants = throttle(updateTenants, throttleInterval, {"trailing": false});
    }

    public reloadTenants(){
        return this.throttledReloadTenants()
    }
}