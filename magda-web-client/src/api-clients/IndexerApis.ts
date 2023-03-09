import { config } from "../config";
import fetch from "isomorphic-fetch";
import request from "../helpers/request";
import ServerError from "@magda/typescript-common/dist/ServerError";

/**
 * Trigger a full proactive re-indexer process for all datasets.
 * You will need the permission to operation uri `api/indexer/reindex` in order to access this API.
 * When return `true`, a new reindex process has been triggered.
 * `false` means that there is already an existing re-index process that is in process.
 *
 * @export
 * @return {*}  {Promise<boolean>}
 */
export async function fullReIndex(): Promise<boolean> {
    const url = config.indexerApiBaseUrl + `reindex`;
    const res = await fetch(url, {
        method: "POST"
    });

    if (res.status === 202) {
        // HTTP Accepted Status, a new reindex process has been triggered
        return true;
    } else if (res.status === 409) {
        // HTTP Conflict, there is already an reindex process that is in process
        return false;
    } else {
        throw new ServerError(await res.text(), res.status);
    }
}

/**
 * Get indexer's full re-indexer process status.
 * `true`: there is an existing full re-indexing process that is in-progress.
 * `false`: the indexer is not in process of performing full re-indexing at this moment.
 *
 * @export
 * @return {*}  {Promise<boolean>}
 */
export async function getFullReIndexStatus(): Promise<boolean> {
    const url = config.indexerApiBaseUrl + `reindex/in-progress`;
    const res = await fetch(url, {
        method: "GET"
    });

    if (res.status === 200) {
        const resText = await res.text();
        if (resText === "true") {
            return true;
        } else if (resText === "true") {
            return false;
        } else {
            throw new ServerError("Invalid response: " + resText, 500);
        }
    } else {
        throw new ServerError(await res.text(), res.status);
    }
}

export type IndexDatasetResult = {
    successes: number;
    failures: number;
    warns: number;
    failureReasons: string[];
    warnReasons: string[];
};

/**
 * index one dataset on ad hoc basis
 *
 * @export
 * @param {string} datasetId
 * @return {*}  {Promise<IndexDatasetResult>}
 */
export async function indexDatasetById(
    datasetId: string
): Promise<IndexDatasetResult> {
    const url =
        config.indexerApiBaseUrl + `dataset/${encodeURIComponent(datasetId)}`;
    return await request<IndexDatasetResult>("PUT", url);
}

export type DeleteDatasetIndexResult = {
    deleted: boolean;
};

/**
 * Delete one dataset from the search engine index on ad hoc basis.
 * Please note: this function only works before the dataset is deleted from registry.
 * Otherwise, policy engine has no way to determine the access.
 *
 * @export
 * @param {string} datasetId
 * @return {*}  {Promise<IndexDatasetResult>}
 */
export async function deleteDatasetIndexById(
    datasetId: string
): Promise<DeleteDatasetIndexResult> {
    const url =
        config.indexerApiBaseUrl + `dataset/${encodeURIComponent(datasetId)}`;
    try {
        return await request<DeleteDatasetIndexResult>("DELETE", url);
    } catch (e) {
        throw new Error(
            `Failed to delete the search engine index for dataset ${datasetId}. Reason: ${e}`
        );
    }
}
