import { Tenant } from "@magda/typescript-common/dist/generated/registry/api";
import * as request from "request";
import {
    registryApi,
    tenantsTable,
    MAGDA_ADMIN_PORTAL_ID
} from "./setupTenantMode";

export default function updateTenants(retryNum: number): any {
    // TODO: How to use MAGDA_TENANT_ID_HEADER?
    request({
        headers: { "X-Magda-TenantId": MAGDA_ADMIN_PORTAL_ID },
        url: `${registryApi}/tenants`
    })
        .on("error", e => {
            if (retryNum < 0) {
                console.log(
                    `Failed to retrieve tenants. ${
                        e.message
                    }. Too many retries. Give up now.`
                );
            } else {
                console.log(
                    `Failed to retrieve tenants. ${
                        e.message
                    }. Retries left: ${retryNum}`
                );
                setTimeout(() => updateTenants(retryNum - 1), 10000);
            }
        })
        .on("data", tenantsString => {
            console.debug(`tenantsString = ${tenantsString}`);
            const tenantsJson: [Tenant] = JSON.parse(`${tenantsString}`);
            tenantsJson.forEach(t => {
                if (t.enabled == true) {
                    tenantsTable.set(t.domainName.toLowerCase(), t);
                    console.debug(`${t.domainName.toLowerCase()} : ${t.id}`);
                }
            });
        });
}
