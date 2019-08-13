import fetch from "isomorphic-fetch";
import { config } from "config";
import URI from "urijs";

export type OrgUnit = {
    id: string;
    name: string;
    description: string;
};

type ListOrgUnitParams = {
    orgUnitsOnly?: boolean;
};

export async function listOrgUnits({
    orgUnitsOnly: leafNodesOnly
}: ListOrgUnitParams): Promise<OrgUnit[]> {
    const uri = URI(config.authApiUrl)
        .segment("orgunits")
        .addQuery("leafNodesOnly", leafNodesOnly || false);

    const res = await fetch(uri.toString(), config.fetchOptions);

    if (!res.ok) {
        throw new Error("Rejected with " + res.statusText);
    } else {
        return await res.json();
    }
}
