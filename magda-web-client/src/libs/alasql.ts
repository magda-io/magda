import alasql from "alasql/dist/alasql.min.js";
import xlsx from "alasql/modules/xlsx/xlsx.mjs";
import { getRecordAspect } from "../api-clients/RegistryApis";
import { dcatDistributionStrings, formatAspect } from "../helpers/record";
import type ServerError from "@magda/typescript-common/dist/ServerError.js";

alasql.setXLSX(xlsx);

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

let currentDistList: DistributionResourceItem[] = [];
let currentDist: DistributionResourceItem | null = null;

export function setCurrentDistList(list: DistributionResourceItem[]) {
    currentDistList = list;
}

export function setCurrentDist(dist: DistributionResourceItem | null) {
    currentDist = dist;
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

async function dist(...args) {
    const distId: string | number = args[0];
    let dist: DistributionResourceItem | null = null;
    if (distId === "this") {
        if (!currentDist) {
            throw new Error(
                "Failed to use `this` ref to load distribution resource: the current distribution hasn't been set."
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
            url,
            type: resType
        };
    }
    const callArgs = [dist.url, ...(args.length > 1 ? [...args.slice(1)] : [])];
    return alasql.from?.[dist.type]?.apply(null, callArgs as any);
}

alasql.from.dist = dist;
alasql.from.DIST = dist;

// debug code
(window as any).alasql = alasql;
