import fetch from "isomorphic-fetch";
import { config } from "config";
import urijs from "urijs";
import { OrgUnit as OrgUnitType } from "reducers/userManagementReducer";
import request from "helpers/request";
import getRequestNoCache from "helpers/getRequestNoCache";
import { v4 as isUuid } from "is-uuid";
import getRequest from "helpers/getRequest";
import getAbsoluteUrl from "@magda/typescript-common/dist/getAbsoluteUrl";

export type OrgUnit = OrgUnitType;

type ListOrgUnitParams = {
    orgUnitsOnly?: boolean;
    relationshipOrgUnitId?: string;
};

export async function listOrgUnits({
    orgUnitsOnly: leafNodesOnly,
    relationshipOrgUnitId
}: ListOrgUnitParams): Promise<OrgUnitWithRelationship[]> {
    let uri = urijs(config.authApiUrl)
        .segment("orgunits")
        .addQuery("leafNodesOnly", leafNodesOnly || false);

    if (relationshipOrgUnitId) {
        uri = uri.addQuery("relationshipOrgUnitId", relationshipOrgUnitId);
    }

    const res = await fetch(uri.toString(), config.credentialsFetchOptions);

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
 * @param {string} [relationshipOrgUnitId] - Optional; The org unit id that is used to test the relationship with each of returned orgUnit item.
 * @returns {Promise<OrgUnitWithRelationship[]>}
 */
export async function listOrgUnitsAtLevel(
    orgLevel: number,
    relationshipOrgUnitId?: string
): Promise<OrgUnitWithRelationship[]> {
    const uri = `${config.authApiUrl}orgunits/bylevel/${orgLevel}${
        relationshipOrgUnitId
            ? `?relationshipOrgUnitId=${relationshipOrgUnitId}`
            : ""
    }`;

    const res = await fetch(uri, config.credentialsFetchOptions);

    if (!res.ok) {
        throw new Error("Rejected with " + res.statusText);
    } else {
        return await res.json();
    }
}

/**
 * Get Org Unit Details By Id
 *
 * @export
 * @param {string} id
 * @returns {Promise<OrgUnit>}
 */
export async function getOrgUnitById(
    id: string,
    noCache: boolean = false
): Promise<OrgUnit> {
    return await getRequest(
        getAbsoluteUrl(`orgunits/${encodeURIComponent(id)}`, config.authApiUrl),
        noCache
    );
}

export async function getRootNode(noCache = false) {
    if (noCache) {
        return getRequestNoCache(`${config.authApiUrl}orgunits/root`);
    } else {
        return request<OrgUnit>("GET", `${config.authApiUrl}orgunits/root`);
    }
}

/**
 * Get immediate children of a selected node.
 * If none found, return empty array.
 *
 * @export
 * @param {string} nodeId
 * @return {OrgUnit[]}
 */
export async function getImmediateChildren(nodeId: string, noCache = false) {
    if (!isUuid(nodeId)) {
        throw new Error(
            "Failed to get immediate child nodes: specify id is not a valid UUID"
        );
    }
    if (noCache) {
        return getRequestNoCache<OrgUnit[]>(
            `${config.authApiUrl}orgunits/${nodeId}/children/immediate`
        );
    } else {
        return request<OrgUnit[]>(
            "GET",
            `${config.authApiUrl}orgunits/${nodeId}/children/immediate`
        );
    }
}

export async function moveSubTree(nodeId: string, parentNodeId: string) {
    if (!isUuid(nodeId) || !isUuid(parentNodeId)) {
        throw new Error(
            "Failed to move a sub tree: specify id is not a valid UUID"
        );
    }
    await request<OrgUnit[]>(
        "PUT",
        `${config.authApiUrl}orgunits/${nodeId}/move/${parentNodeId}`
    );
}
