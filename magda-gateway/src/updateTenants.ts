import { Tenant } from "@magda/typescript-common/dist/generated/registry/api";
import * as request from "request";
import { MAGDA_ADMIN_PORTAL_ID } from "./buildApp";

export default function updateTenants(
    tenantsTable: Map<String, Tenant>,
    registryApi: string,
    retryNum: number
): any {
    // TODO: How to use MAGDA_TENANT_ID_HEADER exported from "./index".
    request({
        headers: { "X-Magda-TenantId": MAGDA_ADMIN_PORTAL_ID },
        url: `${registryApi}/tenants`
    })
        .on("error", e => {
            if (retryNum < 0) {
                console.log(
                    `Failed to retrieve tenants. ${
                        e.message
                    }. Two many retries. Give up now.`
                );
            } else {
                console.log(
                    `Failed to retrieve tenants. ${
                        e.message
                    }. Retries left: ${retryNum}`
                );
                setTimeout(
                    () =>
                        updateTenants(tenantsTable, registryApi, retryNum - 1),
                    10000
                );
            }
        })
        .on("data", tenantsString => {
            console.debug(`tenantsString = ${tenantsString}`);
            const tenantsJson: [Tenant] = JSON.parse(`${tenantsString}`);
            tenantsJson.forEach(t => {
                tenantsTable.set(t.domainName.toLowerCase(), t);
                console.debug(`${t.domainName.toLowerCase()} : ${t.id}`);
            });
        });
}
