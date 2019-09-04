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

export interface OrgUnitWithRelationship extends OrgUnit {
    relationship?: string;
}

/**
 * List all OrgUnits at certain org tree level.
 * Optionally provide a test Org Unit Id that will be used to
 * test the relationship with each of returned orgUnit item.
 * Possible Value: 'ancestor', 'descendant', 'equal', 'unrelated'.
 *
 * @export
 * @param {number} orgLevel - The level number (starts from 1) where org Units of the tree are taken horizontally.
 * @param {string} [testOrgUnitId] - Optional; The org unit id that is used to test the relationship with each of returned orgUnit item.
 * @returns {Promise<OrgUnitWithRelationship[]>}
 */
export async function listOrgUnitsAtLevel(
    orgLevel: number,
    testOrgUnitId?: string
): Promise<OrgUnitWithRelationship[]> {
    const uri = `${config.authApiUrl}/orgunits/listOrgUnitsAtLevel/${orgLevel}${
        testOrgUnitId ? `/${testOrgUnitId}` : ""
    }`;

    const res = await fetch(uri, config.fetchOptions);

    if (!res.ok) {
        throw new Error("Rejected with " + res.statusText);
    } else {
        return await res.json();
    }
}
