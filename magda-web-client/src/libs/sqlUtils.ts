// todo: should only load type to save bandwidth
// we can't do it now as when code runs in worker when need to access the module reference
import alasql from "alasql";
import { getRecordAspect } from "../api-clients/RegistryApis";
import getStorageApiResourceAccessUrl from "../helpers/getStorageApiResourceAccessUrl";
import {
    ParsedDataset,
    ParsedDistribution,
    dcatDistributionStrings,
    formatAspect
} from "../helpers/record";
import type ServerError from "@magda/typescript-common/dist/ServerError.js";
import { config } from "../config";

export type ResType =
    | "CSV"
    | "TAB"
    | "TSV"
    | "XLSX"
    | "XLS"
    | "JSON"
    | "JSONL"
    | "NDJSON";

export interface DistributionResourceItem {
    url: string;
    type: ResType;
}

let alasqlLoadingPromise: Promise<typeof alasql> | null = null;

let currentDistList: DistributionResourceItem[] = [];
let currentDist: DistributionResourceItem | null = null;
let worker: Worker | null = null;

const inWebWorker = typeof global.document === "undefined" ? true : false;

export function setCurrentDistList(list: DistributionResourceItem[]) {
    if (worker && !inWebWorker) {
        worker.postMessage({
            type: "setCurrentDistList",
            data: list
        });
    } else {
        currentDistList = list;
    }
}

export function setCurrentDist(dist: DistributionResourceItem | null) {
    if (worker && !inWebWorker) {
        worker.postMessage({
            type: "setCurrentDist",
            data: dist
        });
    } else {
        currentDist = dist;
    }
}

export function determineDistResType(formatStr: string, url: string): ResType {
    let format: string = typeof formatStr === "string" ? formatStr.trim() : "";
    if (!format) {
        const idx = url.lastIndexOf(".");
        if (idx === -1 || idx >= url.length - 1) {
            throw new Error("Cannot determine distribution resource type!");
        }
        format = url.substring(idx + 1).trim();
    }
    format = format.toUpperCase();
    switch (format) {
        case "CSV":
            return "CSV";
        case "CSV-GEO-AU":
            return "CSV";
        case "XLSX":
            return "XLSX";
        case "XLS":
            return "XLS";
        case "TAB":
            return "TAB";
        case "TSV":
            return "TSV";
        case "JSON":
            return "JSON";
        case "JSONL":
            return "JSONL";
        case "NDJSON":
            return "NDJSON";
        default:
            throw new Error(
                `Cannot determine distribution resource type: unknown format ${format}`
            );
    }
}

async function getResType(
    distId: string,
    defaultFormat: string,
    url: string
): Promise<ResType> {
    let formatAspectData: formatAspect | undefined = undefined;
    try {
        formatAspectData = await getRecordAspect<formatAspect>(
            distId,
            "dataset-format"
        );
    } catch (e) {
        const error = e as ServerError;
        if (error?.statusCode !== 404) {
            throw e;
        }
    }
    let format: string =
        typeof formatAspectData?.format === "string"
            ? formatAspectData.format.trim()
            : "";
    if (!format) {
        format = typeof defaultFormat === "string" ? defaultFormat.trim() : "";
    }
    return determineDistResType(format, url);
}

export function distribution2ResourceItem(
    item: ParsedDistribution
): DistributionResourceItem | null {
    try {
        const url = item?.downloadURL
            ? item.downloadURL
            : item?.accessURL
            ? item.accessURL
            : "";
        const resType = determineDistResType(item.format, url);
        return {
            url: getStorageApiResourceAccessUrl(url),
            type: resType
        };
    } catch (e) {
        return null;
    }
}

export function dataset2DistributionResourceItems(
    dataset: ParsedDataset
): DistributionResourceItem[] {
    if (!dataset?.distributions?.length) {
        return [];
    }
    return dataset.distributions
        .map(distribution2ResourceItem)
        .filter((item) => item) as DistributionResourceItem[];
}

export async function source(...args) {
    const alasql = await getAlaSQL();
    const distId: string | number | null = args[0];
    const query = args[4];
    const cb = query?.cb;
    try {
        let dist: DistributionResourceItem | null = null;
        if (distId === null || distId === "this") {
            if (!currentDist) {
                throw new Error(
                    "Failed to load the current distribution resource: the current distribution hasn't been set."
                );
            }
            dist = { ...currentDist };
        } else if (typeof distId === "number" && distId >= 0) {
            if (!currentDistList?.[distId]) {
                throw new Error(
                    `Failed to load the distribution resource by index "${distId}": distribution with index "${distId}" doesn't exist or not set.`
                );
            }
            dist = { ...currentDistList[distId] };
        } else {
            const data = await getRecordAspect<dcatDistributionStrings>(
                String(distId),
                "dcat-distribution-strings"
            );
            if (!data?.downloadURL && !data?.accessURL) {
                throw new Error(
                    `Failed to load the distribution resource by id "${distId}": cannot locate URL from metadata data.`
                );
            }
            const url = data?.downloadURL ? data.downloadURL : data?.accessURL;
            const resType = await getResType(String(distId), data?.format, url);
            dist = {
                url: getStorageApiResourceAccessUrl(url),
                type: resType
            };
        }
        const callArgs = [
            dist.url,
            ...(args.length > 1 ? [...args.slice(1)] : [])
        ];
        return alasql.from?.[dist.type]?.apply(null, callArgs as any);
    } catch (e) {
        console.error(e);
        cb?.(undefined, e);
    }
}

/**
 * Use this function to defer the loading of the AlaSQL to the first call
 *
 * @return {*}  {Promise<alasql>}
 */
async function getAlaSQL(): Promise<typeof alasql> {
    if (typeof global.document === "undefined") {
        // in web worker, return global alasql instance
        return alasql;
    }
    if (config?.alasqlRunInIframe) {
        return await getAlaSQLViaIframe();
    }
    if (alasqlLoadingPromise) {
        return await alasqlLoadingPromise;
    } else {
        alasqlLoadingPromise = Promise.all([
            import(/* webpackChunkName:'alasql' */ "alasql/dist/alasql.min.js"),
            import(
                /* webpackChunkName:'alasql-xlsx' */ "alasql/modules/xlsx/xlsx.js"
            )
        ]).then((result) => {
            const [{ default: alasql }, { default: xlsx }] = result;
            // alasql initialization
            alasql.setXLSX(xlsx);
            alasql.from.source = source;
            alasql.from.SOURCE = source;
            return alasql;
        });
        return await alasqlLoadingPromise;
    }
}

let alasqlIframe: HTMLIFrameElement | null = null;

async function getAlaSQLViaIframe(): Promise<typeof alasql> {
    if (alasqlLoadingPromise) {
        return await alasqlLoadingPromise;
    } else {
        const { uiBaseUrl } = config;
        alasqlLoadingPromise = new Promise((resolve, reject) => {
            const refToken = Math.random().toString().replace(".", "");
            (global as any)[`onAlaSQLIframeLoaded${refToken}`] = (
                webWorker
            ) => {
                worker = webWorker;
                setCurrentDist(currentDist);
                setCurrentDistList(currentDistList);
                if (alasqlIframe?.contentWindow) {
                    (alasqlIframe.contentWindow as any).commonFetchRequestOptions = {
                        ...config.commonFetchRequestOptions
                    };
                }
                resolve(alasqlIframe?.contentWindow?.["alasql"]);
            };
            (global as any)[`alasqlSourceFunc${refToken}`] = source;
            (global as any)[`alasqlMagdaConfig${refToken}`] = config;
            alasqlIframe = document.createElement("iframe");
            alasqlIframe.src = `${
                uiBaseUrl === "/" ? uiBaseUrl : uiBaseUrl + "/"
            }assets/alasql.html?refToken=${refToken}`;
            alasqlIframe.style.cssText =
                "width:1px;border:0px;height:1px;position:absolute;visibility:hidden";

            document.body.appendChild(alasqlIframe);
        });
        return await alasqlLoadingPromise;
    }
}

export async function runQuery<T = any>(
    query: string,
    params?: any[]
): Promise<T> {
    const alasql = await getAlaSQL();
    return await alasql.promise(query, params);
}
