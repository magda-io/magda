import RegistryClient from "@magda/typescript-common/dist/registry/RegistryClient";
import { Tenant } from "@magda/typescript-common/dist/generated/registry/api";

export default function loadTenantsTable(
    tenantsTable: Map<String, Tenant>,
    url: string
) {
    new RegistryClient({ baseUrl: url })
        .getTenants()
        .then((tenants: Tenant[]) => {
            tenants.forEach(t => {
                tenantsTable.set(t.domainName, t);
                console.debug(`${t.domainName} : ${t.id}`);
            });
        })
        .catch(error => {
            console.error(`Error occurred in getting tenants ${error}`);
        });
}
