require("isomorphic-fetch");
import { throttle, Cancelable } from "lodash"
import {Tenant} from "@magda/typescript-common/dist/tenant-api/Tenant"
import AuthorizedTenantClient from "@magda/typescript-common/dist/tenant-api/AuthorizedTenantClient"

export const tenantsTable = new Map<String, Tenant>();

let tenantApiClient: AuthorizedTenantClient;
 
async function updateTenants(){
    const res = await tenantApiClient.getTenants();
    const tenants = <Tenant[]>res;
    tenantsTable.clear();
    tenants.forEach(t => {
        if (t.enabled === true) {
            tenantsTable.set(t.domainname.toLowerCase(), t);
            console.debug(`${t.domainname.toLowerCase()} : ${t.id}`);
        }
    });
}

export default class TenantsLoader {
    private throttledReloadTenants: (() => Promise<void>) & Cancelable;

    constructor(tenantUrl: string, jwtScret: string, userId: string,  minFetchIntervalInMs: number = 60000){
        console.debug(`TenantsLoader throttle interval = ${minFetchIntervalInMs}`);
        tenantApiClient = new AuthorizedTenantClient({
            urlStr: tenantUrl,
            jwtSecret: jwtScret,
            userId: userId
        })
        
        this.throttledReloadTenants = throttle(updateTenants, minFetchIntervalInMs, {"trailing": false});
    }

    public reloadTenants(){
        return this.throttledReloadTenants()
    }
}