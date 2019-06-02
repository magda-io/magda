require("isomorphic-fetch");
import { Tenant } from "@magda/typescript-common/dist/generated/registry/api";
import { registryApi } from "./setupTenantMode";
import { MAGDA_ADMIN_PORTAL_ID } from "@magda/typescript-common/dist/registry/TenantConsts";
import { throttle, Cancelable } from "lodash"

export const tenantsTable = new Map<String, Tenant>();

async function updateTenants(){
    const res = await fetch(`${registryApi}/tenants`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "X-Magda-Tenant-Id": `${MAGDA_ADMIN_PORTAL_ID}` // Warning: The fetch will automatically make the header name X-Magda-Tenant-Id into lowercases.
        }
    });
    const tenants = await <Promise<Tenant[]>>res.json();
    tenantsTable.clear();
    tenants.forEach(t => {
        if (t.enabled === true) {
            tenantsTable.set(t.domainName.toLowerCase(), t);
            console.debug(`${t.domainName.toLowerCase()} : ${t.id}`);
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