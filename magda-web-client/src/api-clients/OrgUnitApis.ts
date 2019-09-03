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

export interface CandidateOrgUnit extends OrgUnit {
    isDefault?: boolean;
}

/**
 * List Candidate Custodian OrgUnits by org tree level.
 * Optionally provide a Org Unit Id that will be used to mark
 * one candidate org unit (if exist) who is on the same org tree path
 * as the default candidate (`isDefault` field = true).
 *
 * @export
 * @param {number} custodianOrgLevel - The level number where all org Units of the tree are taken horizontally as candidate
 * @param {string} [samePathOrgUnitId] - The org unit id that is used to set the default candidate (by lookup the org unit that is on the same tree path)
 * @returns {Promise<OrgUnit[]>}
 */
export async function listCandidateCustodianOrgUnits(
    custodianOrgLevel: number,
    samePathOrgUnitId?: string
): Promise<CandidateOrgUnit[]> {
    const uri = `${
        config.authApiUrl
    }/orgunits/listCandidateCustodianOrgUnits/${custodianOrgLevel}${
        samePathOrgUnitId ? `/${samePathOrgUnitId}` : ""
    }`;

    const res = await fetch(uri, config.fetchOptions);

    if (!res.ok) {
        throw new Error("Rejected with " + res.statusText);
    } else {
        return await res.json();
    }
}
