import { Tenant } from "@magda/typescript-common/dist/generated/registry/api";
import * as request from "request";
import {
    registryApi,
    tenantsTable,
    MAGDA_ADMIN_PORTAL_ID
} from "./setupTenantMode";

export default async function reloadTenants() {
    await new Promise<{}>((resolve, reject) => {
        request({
            headers: { "X-Magda-TenantId": MAGDA_ADMIN_PORTAL_ID },
            url: `${registryApi}/tenants`
        })
            .on("data", tenantsString => {
                const tenantsJson: [Tenant] = JSON.parse(`${tenantsString}`);
                tenantsTable.clear();
                tenantsJson.forEach(t => {
                    if (t.enabled === true) {
                        tenantsTable.set(t.domainName.toLowerCase(), t);
                        console.debug(
                            `${t.domainName.toLowerCase()} : ${t.id}`
                        );
                    }
                });
                resolve();
            })
            .on("error", e => {
                reject(`  Got error: ${e.message}`);
            });
    });
}
