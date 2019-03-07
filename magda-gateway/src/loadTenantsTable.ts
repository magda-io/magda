import RegistryClient from "@magda/typescript-common/dist/registry/RegistryClient";
import { Tenant } from "@magda/typescript-common/dist/generated/registry/api";

export default function loadTenantsTable(
    tenantsTable: Map<String, Tenant>,
    url: string
) {
    let registryClient = new RegistryClient({ baseUrl: url });
    registryClient.getTenants().then((tenants: any[]) => {
        let tenantsJson = <Array<Tenant>>tenants;
        tenantsJson.forEach(t => tenantsTable.set(t.domainName, t));
    });
}
