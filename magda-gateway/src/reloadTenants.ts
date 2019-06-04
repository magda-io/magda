require("isomorphic-fetch");
import { tenantApi } from "./setupTenantMode";
import { MAGDA_ADMIN_PORTAL_ID } from "@magda/typescript-common/dist/registry/TenantConsts";
import { throttle, Cancelable } from "lodash"
import {Tenant} from "@magda/typescript-common/dist/tenant-api/Tenant"

export const tenantsTable = new Map<String, Tenant>();

async function updateTenants(){
    const res = await fetch(`${tenantApi}/tenants`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "X-Magda-Tenant-Id": `${MAGDA_ADMIN_PORTAL_ID}` // Warning: The fetch will automatically make the header name X-Magda-Tenant-Id into lowercases.
        }
    });
    const tenants: Tenant[] = await <Promise<Tenant[]>>res.json();
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

    constructor(minFetchIntervalInMs: number = 60000){
        console.debug(`TenantsLoader throttle interval = ${minFetchIntervalInMs}`);
        this.throttledReloadTenants = throttle(updateTenants, minFetchIntervalInMs, {"trailing": false});
    }

    public reloadTenants(){
        return this.throttledReloadTenants()
    }
}