import { config } from "config";
import request from "helpers/request";
import getRequest from "helpers/getRequest";
import getAbsoluteUrl from "@magda/typescript-common/dist/getAbsoluteUrl";
import { Publisher } from "helpers/record";
import { RawDataset } from "helpers/record";
import ServerError from "@magda/typescript-common/dist/ServerError";
import flatMap from "lodash/flatMap";

import dcatDatasetStringsAspect from "@magda/registry-aspects/dcat-dataset-strings.schema.json";
import spatialCoverageAspect from "@magda/registry-aspects/spatial-coverage.schema.json";
import temporalCoverageAspect from "@magda/registry-aspects/temporal-coverage.schema.json";
import datasetDistributionsAspect from "@magda/registry-aspects/dataset-distributions.schema.json";
import dcatDistributionStringsAspect from "@magda/registry-aspects/dcat-distribution-strings.schema.json";
import accessAspect from "@magda/registry-aspects/access.schema.json";
import provenanceAspect from "@magda/registry-aspects/provenance.schema.json";
import informationSecurityAspect from "@magda/registry-aspects/information-security.schema.json";
import datasetPublisherAspect from "@magda/registry-aspects/dataset-publisher.schema.json";
import currencyAspect from "@magda/registry-aspects/currency.schema.json";
import datasetPublishingAspect from "@magda/registry-aspects/publishing.schema.json";
import accessControlAspect from "@magda/registry-aspects/access-control.schema.json";
import organizationDetailsAspect from "@magda/registry-aspects/organization-details.schema.json";
import sourceAspect from "@magda/registry-aspects/source.schema.json";
import datasetDraftAspect from "@magda/registry-aspects/dataset-draft.schema.json";
import ckanExportAspect from "@magda/registry-aspects/ckan-export.schema.json";
import versionAspect from "@magda/registry-aspects/version.schema.json";
import createNoCacheFetchOptions from "./createNoCacheFetchOptions";
import formUrlencode from "./formUrlencode";

export const aspectSchemas = {
    publishing: datasetPublishingAspect,
    "dcat-dataset-strings": dcatDatasetStringsAspect,
    "spatial-coverage": spatialCoverageAspect,
    "temporal-coverage": temporalCoverageAspect,
    "dataset-distributions": datasetDistributionsAspect,
    "dcat-distribution-strings": dcatDistributionStringsAspect,
    access: accessAspect,
    provenance: provenanceAspect,
    "information-security": informationSecurityAspect,
    "access-control": accessControlAspect,
    "dataset-publisher": datasetPublisherAspect,
    "organization-details": organizationDetailsAspect,
    currency: currencyAspect,
    source: sourceAspect,
    "dataset-draft": datasetDraftAspect,
    "ckan-export": ckanExportAspect,
    version: versionAspect
};

export type VersionItem = {
    versionNumber: number;
    createTime: string;
    creatorId?: string;
    description: string;
    title: string;
    internalDataFileUrl?: string;
    eventId?: number;
};

export type CurrencyData = {
    status: "CURRENT" | "SUPERSEDED" | "RETIRED";
    retireReason?: string;
    supersededBy?: {
        id?: string[];
        name?: string;
    }[];
};

export type VersionAspectData = {
    currentVersionNumber: number;
    versions: VersionItem[];
};

export const getEventIdFromHeaders = (headers: Headers): number => {
    const headerVal = headers.get("x-magda-event-id");
    if (headerVal === null) {
        return 0;
    } else {
        const eventId = parseInt(headerVal);
        if (isNaN(eventId)) {
            return 0;
        } else {
            return eventId;
        }
    }
};

export const getInitialVersionAspectData = (
    title: string,
    creatorId?: string,
    internalDataFileUrl?: string
) => ({
    currentVersionNumber: 0,
    versions: [
        {
            versionNumber: 0,
            createTime: new Date().toISOString(),
            creatorId,
            description: "initial version",
            title,
            ...(internalDataFileUrl ? { internalDataFileUrl } : {})
        }
    ]
});

export type DatasetTypes = "drafts" | "published";

export async function createPublisher(inputRecord: Publisher) {
    return await createRecord(inputRecord);
}

export function fetchOrganization(
    publisherId: string,
    noCache: boolean = false
): Promise<Publisher> {
    let url: string =
        config.registryReadOnlyApiUrl +
        `records/${encodeURIComponent(
            publisherId
        )}?aspect=organization-details`;

    return fetch(
        url,
        noCache
            ? createNoCacheFetchOptions(config.credentialsFetchOptions)
            : config.credentialsFetchOptions
    ).then((response) => {
        if (!response.ok) {
            let statusText = response.statusText;
            // response.statusText are different in different browser, therefore we unify them here
            if (response.status === 404) {
                statusText = "Not Found";
            }
            throw Error(statusText);
        }
        return response.json();
    });
}

/**
 * Ensure aspect exists in registry by storing the aspect def to registry.
 * Here we are not going to skip storing the aspect def if the aspect def already exists as we don't know whether it's an up-to-date one in registry.
 * For now, we only make sure the aspect def won't be stored to registry for multiple times.
 * @param id
 * @param jsonSchema
 */
export async function ensureAspectExists(id: string, jsonSchema?: any) {
    // as we now auto create all built-in aspects on the first deployment, we will not auto re-create aspect from frontend anymore.
    // we simply return here but might factor code properly later.
    return;
    // if (!jsonSchema) {
    //     jsonSchema = aspectSchemas[id];
    // }

    // if (!jsonSchema) {
    //     throw new Error(`Cannot locate json schema for ${id}`);
    // }

    // if (!aspectJsonSchemaSavingCache[id]) {
    //     aspectJsonSchemaSavingCache[id] = request(
    //         "PUT",
    //         `${config.registryFullApiUrl}aspects/${id}`,
    //         {
    //             id,
    //             name: jsonSchema.title,
    //             jsonSchema
    //         }
    //     );
    // }

    // await aspectJsonSchemaSavingCache[id];
}

// --- See registry API document for API [Get a list of all records](https://dev.magda.io/api/v0/apidocs/index.html#api-Registry_Record_Service-GetV0RegistryRecords) for more details
export enum AspectQueryOperators {
    "=" = ":", // --- equal
    "!=" = ":!", // --- Not equal
    patternMatch = ":?", // --- pattern matching. Support Regex Expression as well.
    patternNotMatch = ":!?",
    ">" = ":>",
    "<" = ":<",
    ">=" = ":>=",
    "<=" = ":<=",
    arrayContains = ":<|",
    arrayNotContains = ":!<|"
}

export class AspectQuery {
    public path: string;
    public operator: AspectQueryOperators;
    public value: string | number | boolean;
    // --- when `true`, all aspectQuery will be grouped with `AND` operator, otherwise, will be `OR`
    public isAndQuery: boolean = true;

    constructor(
        path: string,
        operator: AspectQueryOperators,
        value: string | number | boolean,
        isAndQuery?: boolean
    ) {
        this.path = path;
        this.operator = operator;
        this.value = value;
        if (typeof isAndQuery === "boolean") {
            this.isAndQuery = isAndQuery;
        }
    }

    /**
     * We use URLDecode.decode to decode query string value.
     * To make sure `application/x-www-form-urlencoded` encoded string reach aspectQuery parser
     * This ensures `%` is encoded as `%2525` in the final url string
     *
     * @param {string} str
     * @returns
     * @memberof AspectQuery
     */
    encodeAspectQueryComponent(str: string) {
        return encodeURIComponent(formUrlencode(str));
    }

    toString() {
        return encodeURIComponent(
            formUrlencode(this.path) +
                this.operator +
                formUrlencode(String(this.value))
        );
    }
}

export const DEFAULT_OPTIONAL_FETCH_ASPECT_LIST = [
    "dcat-distribution-strings",
    "dataset-distributions",
    "temporal-coverage",
    "usage",
    "access",
    "dataset-publisher",
    "source",
    "source-link-status",
    "dataset-quality-rating",
    "spatial-coverage",
    "publishing",
    "access-control",
    "provenance",
    "information-security",
    "currency",
    "ckan-export",
    "version"
];

export const DEFAULT_COMPULSORY_FETCH_ASPECT_LIST = ["dcat-dataset-strings"];

export async function fetchRecord<T = RawDataset>(
    id: string,
    optionalAspects: string[] = DEFAULT_OPTIONAL_FETCH_ASPECT_LIST,
    aspects: string[] = DEFAULT_COMPULSORY_FETCH_ASPECT_LIST,
    dereference: boolean = true,
    noCache: boolean = false
): Promise<T> {
    const parameters: string[] = [];

    if (dereference) {
        parameters.push("dereference=true");
    }

    if (aspects?.length) {
        parameters.push(aspects.map((item) => `aspect=${item}`).join("&"));
    }

    if (optionalAspects?.length) {
        parameters.push(
            optionalAspects.map((item) => `optionalAspect=${item}`).join("&")
        );
    }

    const url =
        config.registryReadOnlyApiUrl +
        `records/${encodeURIComponent(id)}${
            parameters.length ? `?${parameters.join("&")}` : ""
        }`;

    const response = await fetch(
        url,
        noCache
            ? createNoCacheFetchOptions(config.credentialsFetchOptions)
            : config.credentialsFetchOptions
    );

    if (!response.ok) {
        let statusText = response.statusText;
        // response.statusText are different in different browser, therefore we unify them here
        if (response.status === 404) {
            statusText = "Not Found";
        }
        throw new ServerError(statusText, response.status);
    }
    const data = await response.json();
    if (data.records) {
        if (data.records.length > 0) {
            return data.records[0];
        } else {
            throw new ServerError("Not Found", 404);
        }
    } else {
        return data;
    }
}

export async function fetchRecordAspect<T = any>(
    datasetId: string,
    aspectId: string,
    noCache: boolean = false
): Promise<T> {
    const url =
        config.registryReadOnlyApiUrl +
        `records/${datasetId}/aspects/${aspectId}`;

    const res = await fetch(
        url,
        noCache
            ? createNoCacheFetchOptions(config.credentialsFetchOptions)
            : config.credentialsFetchOptions
    );

    if (!res.ok) {
        throw new ServerError(res.statusText, res.status);
    }

    return (await res.json()) as T;
}

export async function fetchHistoricalRecord<T = RawDataset>(
    id: string,
    eventId: number,
    noCache: boolean = false
): Promise<T> {
    if (typeof eventId !== "number") {
        throw new Error("eventId parameter needs to be a number.");
    }

    const url =
        config.registryReadOnlyApiUrl +
        `records/${encodeURIComponent(id)}/history/${eventId}`;

    const response = await fetch(
        url,
        noCache
            ? createNoCacheFetchOptions(config.credentialsFetchOptions)
            : config.credentialsFetchOptions
    );

    if (!response.ok) {
        let statusText = response.statusText;
        // response.statusText are different in different browser, therefore we unify them here
        if (response.status === 404) {
            statusText = "Not Found";
        }
        throw new ServerError(statusText, response.status);
    }
    return await response.json();
}

export const fetchRecordWithNoCache = <T = RawDataset>(
    id: string,
    optionalAspects: string[] = DEFAULT_OPTIONAL_FETCH_ASPECT_LIST,
    aspects: string[] = DEFAULT_COMPULSORY_FETCH_ASPECT_LIST,
    dereference: boolean = true
): Promise<T> => fetchRecord(id, optionalAspects, aspects, dereference, true);

export type FetchRecordsOptions = {
    aspects?: string[];
    optionalAspects?: string[];
    pageToken?: string;
    start?: number;
    limit?: number;
    dereference?: boolean;
    aspectQueries?: AspectQuery[];
    orderBy?: string;
    orderByDirection?: "asc" | "desc";
    noCache?: boolean;
    reversePageTokenOrder?: boolean;
};

export async function fetchRecords({
    aspects,
    optionalAspects,
    pageToken,
    start,
    limit,
    dereference,
    aspectQueries,
    orderBy,
    orderByDirection,
    noCache,
    reversePageTokenOrder
}: FetchRecordsOptions): Promise<{
    records: RawDataset[];
    hasMore: boolean;
    nextPageToken?: string;
}> {
    const parameters: string[] = [];

    if (dereference) {
        parameters.push("dereference=true");
    }

    if (aspects?.length) {
        parameters.push(aspects.map((item) => `aspect=${item}`).join("&"));
    }

    if (optionalAspects?.length) {
        parameters.push(
            optionalAspects.map((item) => `optionalAspect=${item}`).join("&")
        );
    }

    if (aspectQueries?.length) {
        parameters.push(
            aspectQueries
                .map(
                    (item) =>
                        `${
                            item.isAndQuery ? "aspectQuery" : "aspectOrQuery"
                        }=${item.toString()}`
                )
                .join("&")
        );
    }

    if (pageToken) {
        parameters.push(`pageToken=${encodeURIComponent(pageToken)}`);
    }

    if (start) {
        parameters.push(`start=${encodeURIComponent(start)}`);
    }

    if (limit) {
        parameters.push(`limit=${encodeURIComponent(limit)}`);
    }

    if (orderBy) {
        parameters.push(`orderBy=${encodeURIComponent(orderBy)}`);
        if (orderByDirection) {
            parameters.push(
                `orderByDir=${encodeURIComponent(orderByDirection)}`
            );
        }
    }

    if (reversePageTokenOrder) {
        parameters.push(`reversePageTokenOrder=true`);
    }

    const url =
        config.registryReadOnlyApiUrl +
        `records${parameters.length ? `?${parameters.join("&")}` : ""}`;

    const response = await fetch(
        url,
        noCache
            ? createNoCacheFetchOptions(config.credentialsFetchOptions)
            : config.credentialsFetchOptions
    );

    if (!response.ok) {
        throw new ServerError(response.statusText, response.status);
    }

    const data = await response.json();
    if (data?.records?.length > 0) {
        return {
            records: data.records,
            hasMore: data.hasMore,
            nextPageToken: data.nextPageToken
        };
    } else {
        return {
            records: [],
            hasMore: false,
            nextPageToken: ""
        };
    }
}

export type FetchRecordsCountOptions = {
    aspectQueries?: AspectQuery[];
    aspects?: string[];
    noCache?: boolean;
};

export async function fetchRecordsCount({
    aspectQueries,
    aspects,
    noCache
}: FetchRecordsCountOptions): Promise<number> {
    const parameters: string[] = [];

    if (aspects?.length) {
        parameters.push(aspects.map((item) => `aspect=${item}`).join("&"));
    }

    if (aspectQueries?.length) {
        parameters.push(
            aspectQueries
                .map(
                    (item) =>
                        `${
                            item.isAndQuery ? "aspectQuery" : "aspectOrQuery"
                        }=${item.toString()}`
                )
                .join("&")
        );
    }

    const url =
        config.registryReadOnlyApiUrl +
        `records/count${parameters.length ? `?${parameters.join("&")}` : ""}`;

    const response = await fetch(
        url,
        noCache
            ? createNoCacheFetchOptions(config.credentialsFetchOptions)
            : config.credentialsFetchOptions
    );

    if (!response.ok) {
        throw new ServerError(response.statusText, response.status);
    }

    const data = await response.json();
    if (typeof data?.count === "number") {
        return data.count;
    } else {
        throw new Error(`Invalid response: ${await response.text()}`);
    }
}

export async function deleteRecordAspect(
    recordId: string,
    aspectId: string
): Promise<[boolean, number]> {
    const [res, headers] = await request<{ deleted: boolean }>(
        "DELETE",
        `${config.registryFullApiUrl}records/${recordId}/aspects/${aspectId}`,
        undefined,
        undefined,
        true
    );
    return [res.deleted, getEventIdFromHeaders(headers)];
}

export async function deleteRecord(
    recordId: string
): Promise<[boolean, number]> {
    const [res, headers] = await request<{ deleted: boolean }>(
        "DELETE",
        `${config.registryFullApiUrl}records/${recordId}`,
        undefined,
        undefined,
        true
    );
    return [res.deleted, getEventIdFromHeaders(headers)];
}

export async function doesRecordExist(id: string) {
    try {
        //--- we turned off cache with last `true` parameter here
        await fetchRecordWithNoCache(id, [], [], false);
        return true;
    } catch (e) {
        if (e.statusCode === 404) {
            return false;
        }
        throw e;
    }
}

export type Record = {
    id: string;
    name: string;
    aspects: { [aspectId: string]: any };
};

export async function createRecord(
    inputRecord: Record
): Promise<[Record, number]> {
    const [res, headers] = await request<Record>(
        "POST",
        `${config.registryFullApiUrl}records`,
        inputRecord,
        "application/json",
        true
    );
    return [res, getEventIdFromHeaders(headers)];
}

export type JsonSchema = {
    $schema?: string;
    title?: string;
    description?: string;
    type: string;
    [k: string]: any;
};

function getAspectIds(record: Record): string[] {
    if (!record.aspects) {
        return [];
    }
    return Object.keys(record.aspects);
}

function getRecordsAspectIds(records: Record[]): string[] {
    return flatMap(records.map((item) => getAspectIds(item)));
}

export async function createDataset(
    inputDataset: Record,
    inputDistributions: Record[],
    tagDistributionVersion: boolean = false
): Promise<[Record, number]> {
    // make sure all the aspects exist (this should be improved at some point, but will do for now)
    const aspectPromises = getRecordsAspectIds(
        [inputDataset].concat(inputDistributions)
    ).map((aspectId) => ensureAspectExists(aspectId));

    await Promise.all(aspectPromises);

    for (const distribution of inputDistributions) {
        const [distRecord, headers] = await request<Record>(
            "POST",
            `${config.registryFullApiUrl}records`,
            distribution,
            "application/json",
            true
        );
        if (tagDistributionVersion) {
            await tagRecordVersionEventId(
                distRecord,
                getEventIdFromHeaders(headers)
            );
        }
    }
    const [json, headers] = await request<Record>(
        "POST",
        `${config.registryFullApiUrl}records`,
        inputDataset,
        "application/json",
        true
    );

    return [json, getEventIdFromHeaders(headers)];
}

export async function updateDataset(
    inputDataset: Record,
    inputDistributions: Record[],
    tagDistributionVersion: boolean = false
): Promise<[Record, number]> {
    // make sure all the aspects exist (this should be improved at some point, but will do for now)
    const aspectPromises = getRecordsAspectIds(
        [inputDataset].concat(inputDistributions)
    ).map((aspectId) => ensureAspectExists(aspectId));

    await Promise.all(aspectPromises);

    for (const distribution of inputDistributions) {
        let distRecord: Record, headers: Headers;
        if (await doesRecordExist(distribution.id)) {
            [distRecord, headers] = await request(
                "PUT",
                `${config.registryFullApiUrl}records/${distribution.id}`,
                distribution,
                "application/json",
                true
            );
        } else {
            [distRecord, headers] = await request(
                "POST",
                `${config.registryFullApiUrl}records`,
                distribution,
                "application/json",
                true
            );
        }
        if (tagDistributionVersion) {
            await tagRecordVersionEventId(
                distRecord,
                getEventIdFromHeaders(headers)
            );
        }
    }
    const [json, headers] = await request<Record>(
        "PUT",
        `${config.registryFullApiUrl}records/${inputDataset.id}`,
        inputDataset,
        "application/json",
        true
    );

    return [json, getEventIdFromHeaders(headers)];
}

/**
 * Update a record aspect. If the aspect not exist, it will be created.
 *
 * @export
 * @template T
 * @param {string} recordId
 * @param {string} aspectId
 * @param {T} aspectData
 * @param {boolean} merge whether merge with existing aspect data or replace it
 * @returns {Promise<T>} Return array of updated aspect data and eventId
 */
export async function updateRecordAspect<T = any>(
    recordId: string,
    aspectId: string,
    aspectData: T,
    merge: boolean = false,
    skipEnsureAspectExists: boolean = false
): Promise<[T, number]> {
    if (!skipEnsureAspectExists) {
        await ensureAspectExists(aspectId);
    }

    const [json, headers] = await request<T>(
        "PUT",
        `${config.registryFullApiUrl}records/${recordId}/aspects/${aspectId}${
            merge ? "?merge=true" : ""
        }`,
        aspectData,
        "application/json",
        true
    );

    return [json, getEventIdFromHeaders(headers)];
}

type JSONPath = {
    op: string;
    path: string;
    value: any;
}[];

/**
 * Patch a record via JSON patch.
 * This function does not auto check aspect definition via `ensureAspectExists`
 *
 * @export
 * @template T
 * @param {string} recordId
 * @param {T} aspectData
 * @returns {Promise<[T, number]>} Return array of patched aspect data and eventId
 */
export async function patchRecord<T = any>(
    recordId: string,
    jsonPath: JSONPath
): Promise<[T, number]> {
    const [json, headers] = await request<T>(
        "PATCH",
        `${config.registryFullApiUrl}records/${recordId}`,
        jsonPath,
        "application/json",
        true
    );

    return [json, getEventIdFromHeaders(headers)];
}

/**
 * If a record's current version's eventId has not been set, this function set it to specified eventId.
 * The eventId later can be used to retrieve the record data as it was when the event had been created.
 * i.e. the `version` emulate the `tag` concept of git where eventId can be considered as the `commit hash`.
 *
 * @param {Record} record
 * @param {number} eventId
 * @returns
 */
export async function tagRecordVersionEventId(record: Record, eventId: number) {
    if (!record?.aspects?.["version"] || !eventId) {
        return;
    }
    const versionData = record.aspects["version"] as VersionAspectData;
    const currentVersion =
        versionData?.versions?.[versionData?.currentVersionNumber];
    if (!currentVersion) {
        return;
    }
    if (currentVersion.eventId) {
        return;
    }
    versionData.versions[versionData.currentVersionNumber].eventId = eventId;

    return await updateRecordAspect(record.id, "version", versionData);
}

export async function fetchRecordById(recordId: string, noCache = false) {
    return await getRequest<Record>(
        getAbsoluteUrl(
            `records/${encodeURIComponent(recordId)}`,
            config.registryReadOnlyApiUrl
        ),
        noCache
    );
}

export type QueryRecordAspectsParams = {
    recordId: string;
    keyword?: string;
    aspectIdOnly?: boolean;
    offset?: number;
    limit?: number;
    noCache?: boolean;
};

export type RecordAspectRecord = {
    id: string;
    data?: any;
};

export type QueryRecordAspectsReturnValueType = RecordAspectRecord[] | string[];

/**
 * Get all aspects of a record. When params.aspectIdOnly == `true`, it will response a list of aspect id.
 *
 * @export
 * @template QueryRecordAspectsReturnValueType
 * @param {QueryRecordAspectsParams} params
 * @return {*}  {Promise<QueryRecordAspectsReturnValueType>}
 */
export async function queryRecordAspects<T = QueryRecordAspectsReturnValueType>(
    params: QueryRecordAspectsParams
): Promise<T> {
    const { noCache, recordId, ...queryParams } = params
        ? params
        : ({} as QueryRecordAspectsParams);
    if (!recordId?.trim()) {
        throw new Error(
            "Failed to request record aspects: record ID cannot be empty!"
        );
    }
    return await getRequest<T>(
        getAbsoluteUrl(
            `records/${encodeURIComponent(recordId)}/aspects`,
            config.registryReadOnlyApiUrl,
            queryParams
        ),
        noCache
    );
}

export type QueryRecordAspectsCountParams = Omit<
    QueryRecordAspectsParams,
    "aspectIdOnly" | "offset" | "limit"
>;

export async function queryRecordAspectsCount(
    params?: QueryRecordAspectsCountParams
): Promise<number> {
    const { noCache, recordId, ...queryParams } = params
        ? params
        : ({} as QueryRecordAspectsCountParams);

    try {
        const res = await getRequest<{ count: number }>(
            getAbsoluteUrl(
                `records/${encodeURIComponent(recordId)}/aspects/count`,
                config.registryReadOnlyApiUrl,
                queryParams
            ),
            noCache
        );
        return res?.count ? res.count : 0;
    } catch (e) {
        if (e instanceof ServerError && e.statusCode === 404) {
            return 0;
        }
        throw e;
    }
}

export async function getRecordAspect<T = any>(
    recordId: string,
    aspectId: string,
    noCache: boolean = false
): Promise<T> {
    if (!recordId?.trim()) {
        throw new Error(
            "Failed to get record aspect: record ID cannot be empty!"
        );
    }
    if (!aspectId?.trim()) {
        throw new Error(
            "Failed to get record aspect: aspect ID cannot be empty!"
        );
    }
    return await getRequest<T>(
        getAbsoluteUrl(
            `records/${encodeURIComponent(
                recordId
            )}/aspects/${encodeURIComponent(aspectId)}`,
            config.registryReadOnlyApiUrl
        ),
        noCache
    );
}

export type AspectDefRecord = {
    id: string;
    name: string;
    jsonSchema: {
        [key: string]: any;
    };
};

export async function getAspectDefs(noCache = false) {
    return await getRequest<AspectDefRecord[]>(
        getAbsoluteUrl("aspects", config.registryReadOnlyApiUrl),
        noCache
    );
}

export async function getDistributionIds(datasetId: string): Promise<string[]> {
    try {
        const data = await fetchRecordAspect(
            datasetId,
            "dataset-distributions",
            true
        );
        if (data?.distributions?.length) {
            return data.distributions as string[];
        } else {
            return [];
        }
    } catch (e) {
        if (e instanceof ServerError && e.statusCode === 404) {
            return [];
        } else {
            throw e;
        }
    }
}

/**
 *
 * Update aspect data of the same id aspect on both dataset record and all its distributions.
 *
 * @export
 * @template T
 * @param {string} datasetId
 * @param {string} aspectId
 * @param {T} aspectData
 * @param {boolean} [merge=true] When set to `true`, the aspectData will be merged with existing data. Otherwise, always replace.
 * @return {*}  {Promise<number[]>} a list of eventId of generated for each of records (including the dataset record & all its distributions).
 * Please note: `0` event id returned indicates no changes have been done on the record.
 */
export async function updateAspectOfDatasetAndDistributions<T = any>(
    datasetId: string,
    aspectId: string,
    aspectData: T,
    merge: boolean = true
): Promise<number[]> {
    if (!datasetId) {
        throw new ServerError("datasetId cannot be empty!", 400);
    }
    if (!aspectId) {
        throw new ServerError("aspectId cannot be empty!", 400);
    }

    const datasetDistributionIds = await getDistributionIds(datasetId);
    const url = getAbsoluteUrl(
        `records/aspects/${encodeURIComponent(aspectId)}`,
        config.registryFullApiUrl,
        { merge }
    );

    return await request<number[]>("PUT", url, {
        recordIds: [datasetId, ...datasetDistributionIds],
        data: aspectData
    });
}
