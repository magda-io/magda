require("isomorphic-fetch");
import { Tenant } from "@magda/typescript-common/dist/generated/registry/api";
import { registryApi } from "./setupTenantMode";
import { MAGDA_ADMIN_PORTAL_ID } from "@magda/typescript-common/dist/registry/TenantConsts";

export const tenantsTable = new Map<String, Tenant>();

export default async function reloadTenants() {
    await new Promise<{}> ( (resolve, reject) => {
        fetch(`${registryApi}/tenants`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "X-Magda-Tenant-Id": `${MAGDA_ADMIN_PORTAL_ID}`
            }
        })
        .then(res => {
            const tenantsF: Promise<Array<Tenant>> = res.json()
            tenantsF.then( tenants => {
                tenantsTable.clear();
                tenants.forEach( t => {
                    if (t.enabled === true) {
                        tenantsTable.set(t.domainName.toLowerCase(), t);
                        console.debug(`${t.domainName.toLowerCase()} : ${t.id}`);
                    }
                });
                resolve();
            })
        })
        .catch(e => {
            reject(`  Got error: ${e.message}`);
        })
    })
}

