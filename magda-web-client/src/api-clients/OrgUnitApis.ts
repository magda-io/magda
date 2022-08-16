import { config } from "config";
import { OrgUnit as OrgUnitType } from "reducers/userManagementReducer";
import request from "helpers/request";
import { v4 as isUuid } from "is-uuid";
import getRequest from "helpers/getRequest";
import getAbsoluteUrl from "@magda/typescript-common/dist/getAbsoluteUrl";
import mute404FetchDataError from "../helpers/mute404FetchDataError";

export type OrgUnit = OrgUnitType;

type ListOrgUnitParams = {
    name?: string;
    leafNodesOnly?: boolean;
    relationshipOrgUnitId?: string;
};

export async function listOrgUnits(
    query: ListOrgUnitParams
): Promise<OrgUnitWithRelationship[]> {
    const queryParams = {
        ...query
    };
    if (!query?.leafNodesOnly) {
        delete queryParams["leafNodesOnly"];
    }
    return await getRequest<OrgUnitWithRelationship[]>(
        getAbsoluteUrl(`orgunits`, config.authApiUrl, queryParams)
    );
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
    return await getRequest<OrgUnitWithRelationship[]>(
        getAbsoluteUrl(
            `orgunits/bylevel/${encodeURIComponent(orgLevel)}`,
            config.authApiUrl,
            relationshipOrgUnitId ? { relationshipOrgUnitId } : undefined
        )
    );
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
): Promise<OrgUnit | undefined> {
    return mute404FetchDataError(() =>
        getRequest<OrgUnit>(
            getAbsoluteUrl(
                `orgunits/${encodeURIComponent(id)}`,
                config.authApiUrl
            ),
            noCache
        )
    );
}

export async function getRootNode(noCache = false) {
    return getRequest<OrgUnit>(
        getAbsoluteUrl(`orgunits/root`, config.authApiUrl),
        noCache
    );
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
            "Failed to get immediate child nodes: specified id is not a valid UUID"
        );
    }
    return getRequest<OrgUnit[]>(
        getAbsoluteUrl(
            `orgunits/${encodeURIComponent(nodeId)}/children/immediate`,
            config.authApiUrl
        ),
        noCache
    );
}

export async function moveSubTree(nodeId: string, parentNodeId: string) {
    if (!isUuid(nodeId) || !isUuid(parentNodeId)) {
        throw new Error(
            "Failed to move a sub tree: specified id is not a valid UUID"
        );
    }
    await request<OrgUnit[]>(
        "PUT",
        getAbsoluteUrl(
            `orgunits/${encodeURIComponent(nodeId)}/move/${encodeURIComponent(
                parentNodeId
            )}`,
            config.authApiUrl
        )
    );
}

export async function insertNode(
    parentNodeId: string,
    node: { name: string; description: string }
) {
    if (!isUuid(parentNodeId)) {
        throw new Error(
            "Failed to insert a new node: specified parentNodeId is not a valid UUID"
        );
    }
    return await request<OrgUnit>(
        "POST",
        getAbsoluteUrl(
            `orgunits/${encodeURIComponent(parentNodeId)}/insert`,
            config.authApiUrl
        ),
        node
    );
}

export async function updateNode(
    nodeId: string,
    node: { name: string; description: string }
) {
    if (!isUuid(nodeId)) {
        throw new Error(
            "Failed to update node: specified nodeId is not a valid UUID"
        );
    }
    return await request<OrgUnit>(
        "PUT",
        getAbsoluteUrl(
            `orgunits/${encodeURIComponent(nodeId)}`,
            config.authApiUrl
        ),
        node
    );
}

export async function deleteNode(nodeId: string) {
    if (!isUuid(nodeId)) {
        throw new Error(
            "Failed to delete a node: specified nodeId is not a valid UUID"
        );
    }
    await request<OrgUnit>(
        "DELETE",
        getAbsoluteUrl(
            `orgunits/${encodeURIComponent(nodeId)}`,
            config.authApiUrl
        )
    );
}

export async function deleteSubTree(nodeId: string) {
    if (!isUuid(nodeId)) {
        throw new Error(
            "Failed to delete a sub tree: specified nodeId is not a valid UUID"
        );
    }
    await request<OrgUnit>(
        "DELETE",
        getAbsoluteUrl(
            `orgunits/${encodeURIComponent(nodeId)}/subtree`,
            config.authApiUrl
        )
    );
}

export async function getTopDownPathBetween(
    higherNodeId: string,
    lowerNodeId: string,
    noCache = false
) {
    if (!isUuid(higherNodeId)) {
        throw new Error(`Invalid higherNodeId: ${higherNodeId}`);
    }
    if (!isUuid(lowerNodeId)) {
        throw new Error(`Invalid higherNodeId: ${lowerNodeId}`);
    }
    return getRequest<OrgUnit[]>(
        getAbsoluteUrl(
            `orgunits/${encodeURIComponent(
                higherNodeId
            )}/topDownPathTo/${encodeURIComponent(lowerNodeId)}`,
            config.authApiUrl
        ),
        noCache
    );
}
