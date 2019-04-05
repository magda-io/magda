import { Tenant } from "@magda/typescript-common/dist/generated/registry/api";
import * as request from "request";
import retry from "@magda/typescript-common/dist/retry";
import formatServiceError from "@magda/typescript-common/dist/formatServiceError";
import {
    registryApi,
    tenantsTable,
    MAGDA_ADMIN_PORTAL_ID
} from "./setupTenantMode";

export default function updateTenants(
    secondsBetweenRetries: number,
    maxRetries: number
): Promise<{}> {
    const operation = () => async () =>
        await new Promise<{}>((resolve, reject) => {
            request({
                headers: { "X-Magda-TenantId": MAGDA_ADMIN_PORTAL_ID },
                url: `${registryApi}/tenants`
            })
                .on("data", tenantsString => {
                    console.log(`tenantsString = ${tenantsString}`);
                    const tenantsJson: [Tenant] = JSON.parse(
                        `${tenantsString}`
                    );
                    tenantsJson.forEach(t => {
                        if (t.enabled == true) {
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

    return retry(
        operation(),
        secondsBetweenRetries,
        maxRetries,
        (e: any, retriesLeft: number) =>
            console.log(
                formatServiceError("Failed to GET tenants.", e, retriesLeft)
            ),
        (e: any) => true
    );
}
