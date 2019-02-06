// @flow
import getDateString from "./getDateString";
import { isSupportedFormat as isSupportedMapPreviewFormat } from "../UI/DataPreviewMap";
import type { FetchError } from "../types";
import weightedMean from "weighted-mean";
// dataset query:
//aspect=dcat-dataset-strings&optionalAspect=dcat-distribution-strings&optionalAspect=dataset-distributions&optionalAspect=temporal-coverage&dereference=true&optionalAspect=dataset-publisher&optionalAspect=source

export type RecordAction = {
    json?: Object,
    error?: FetchError,
    type?: string
};

type TemporalCoverage = {
    data: {
        intervals: ?Array<Object>
    }
};

type dcatDistributionStrings = {
    format: string,
    downloadURL: string,
    accessURL: string,
    modified: string,
    license: string,
    description: string
};

type DcatDatasetStrings = {
    description: string,
    keywords: Array<string>,
    landingPage: string,
    title: string,
    issued: string,
    modified: string
};

export type Publisher = {
    id: string,
    name: string,
    aspects: {
        source?: {
            url: string,
            type: string
        },
        "organization-details"?: {
            name: string,
            title: string,
            imageUrl: string,
            description: string
        }
    }
};

export type DatasetPublisher = {
    publisher: Publisher
};

type CompatiblePreviews = {
    map?: boolean,
    chart?: boolean,
    table?: boolean,
    json?: boolean,
    html?: boolean,
    text?: boolean,
    rss?: boolean,
    google?: boolean
};

//aspect=dcat-distribution-strings
export type RawDistribution = {
    id: string,
    name: string,
    aspects: {
        "dcat-distribution-strings": dcatDistributionStrings,
        "source-link-status": {
            status: ?string
        },
        "visualization-info": {
            fields: Object,
            format: string,
            timeseries: boolean,
            wellFormed: boolean,
            compatiblePreviews: CompatiblePreviews
        }
    }
};

export type RawDataset = {
    id: string,
    name: string,
    message?: string,
    aspects: {
        "dcat-dataset-strings": DcatDatasetStrings,
        source?: {
            url: string,
            name: string,
            type: string
        },
        "dataset-publisher"?: DatasetPublisher,
        "dataset-distributions"?: {
            distributions: Array<RawDistribution>
        },
        "temporal-coverage"?: TemporalCoverage
    }
};

export type ParsedDistribution = {
    identifier: string,
    title: string,
    description: string,
    format: string,
    downloadURL: ?string,
    accessURL: ?string,
    updatedDate: ?string,
    license: string,
    linkActive: boolean,
    linkStatusAvailable: boolean,
    isTimeSeries: boolean,
    chartFields?: ?Object,
    compatiblePreviews: CompatiblePreviews
};

// all aspects become required and must have value
export type ParsedDataset = {
    identifier: string,
    title: string,
    issuedDate: string,
    updatedDate: string,
    landingPage: string,
    tags: Array<string>,
    description: string,
    distributions: Array<ParsedDistribution>,
    temporalCoverage: ?TemporalCoverage,
    publisher: Publisher,
    source: string,
    linkedDataRating: number,
    contactPoint: string,
    error: ?FetchError
};

export const defaultPublisher: Publisher = {
    id: "",
    name: "",
    aspects: {
        source: {
            url: "",
            type: ""
        },
        "organization-details": {
            name: "",
            title: "",
            imageUrl: "",
            description: "No Description available for this organisation"
        }
    }
};

const defaultDatasetAspects = {
    "dcat-dataset-strings": {
        description: undefined,
        keywords: [],
        landingPage: undefined,
        title: undefined,
        issued: undefined,
        modified: undefined
    },
    "dataset-distributions": {
        distributions: []
    },
    "temporal-coverage": null,
    "dataset-publisher": { publisher: defaultPublisher },
    source: {
        url: "",
        name: "",
        type: ""
    },
    error: null
};

const defaultDistributionAspect = {
    "dcat-distribution-strings": {
        format: null,
        downloadURL: null,
        accessURL: null,
        updatedDate: null,
        license: null,
        description: null
    },
    "source-link-status": {
        status: null
    },
    "visualization-info": {
        fields: {},
        format: null,
        timeseries: false,
        wellFormed: false,
        compatiblePreviews: null
        // Decisions to be made here on what the default should be
        // For now the default has to be null so that it can be overriden by the
        //  guessCompatiblePreviews output
        // {
        //     map: false,
        //     chart: false,
        //     table: false,
        //     json: false,
        //     html: false,
        //     text: false,
        //     rss: false,
        //     google: false
        // }
    }
};

function getFormatString(aspects) {
    const defaultString = "Unknown format";
    if (!aspects || typeof aspects !== "object") return defaultString;
    const dcatAspect = aspects["dcat-distribution-strings"];
    const formatAspect = aspects["dataset-format"];
    if (formatAspect && formatAspect["format"]) return formatAspect["format"];
    if (dcatAspect && dcatAspect["format"]) return dcatAspect["format"];
    return defaultString;
}

function guessCompatiblePreviews(format, isTimeSeries): CompatiblePreviews {
    // Make a guess of compatible previews from the format
    // Should be temporary before it's properly implemented
    //  in the "visualization minion"
    const compatiblePreviews = {
        map: false,
        chart: false,
        table: false,
        json: false,
        html: false,
        text: false,
        rss: false,
        google: false
    };
    const fmt = format.toLowerCase();

    if (fmt.indexOf("csv") !== -1) {
        compatiblePreviews.table = true;
        compatiblePreviews.google = true;
        compatiblePreviews.chart = true;
    }
    switch (fmt) {
        case "xls":
        case "xlsx":
        case "doc":
        case "docx":
        case "pdf":
            compatiblePreviews.google = true;
            break;
        case "rss":
            compatiblePreviews.rss = true;
            break;
        case "json":
            compatiblePreviews.json = true;
            break;
        case "text":
        case "txt":
            compatiblePreviews.text = true;
            break;
        case "htm":
        case "html":
            compatiblePreviews.html = true;
            break;
        default:
            if (isSupportedMapPreviewFormat(fmt)) compatiblePreviews.map = true;
    }
    return compatiblePreviews;
}

export function parseDistribution(
    record?: RawDistribution
): ParsedDistribution {
    const identifier = record ? record["id"] : null;
    const title = record ? record["name"] : "";

    const aspects = record
        ? Object.assign({}, defaultDistributionAspect, record["aspects"])
        : defaultDistributionAspect;

    const info = aspects["dcat-distribution-strings"];

    const format = getFormatString(aspects);
    const downloadURL = info.downloadURL || null;
    const accessURL = info.accessURL || null;
    const accessNotes = info.accessNotes || null;
    const updatedDate = info.modified ? getDateString(info.modified) : null;
    const license = info.license || "License restrictions unknown";
    const description = info.description || "No description provided";
    const linkStatus = aspects["source-link-status"];
    const linkStatusAvailable = Boolean(linkStatus.status); // Link status is available if status is non-empty string
    const linkActive = linkStatus.status === "active";
    const isTimeSeries = aspects["visualization-info"]["timeseries"];
    const compatiblePreviews =
        aspects["visualization-info"].compatiblePreviews ||
        guessCompatiblePreviews(format, isTimeSeries);
    let chartFields = null;

    if (isTimeSeries) {
        const fields = aspects["visualization-info"].fields;
        const timeFields = Object.keys(fields).filter(
            f => fields[f].time === true
        );
        const numericFields = Object.keys(fields).filter(
            f => fields[f].numeric === true
        );
        chartFields = {
            time: timeFields,
            numeric: numericFields
        };
    }

    return {
        identifier,
        title,
        description,
        format,
        downloadURL,
        accessURL,
        accessNotes,
        updatedDate,
        license,
        linkStatusAvailable,
        linkActive,
        isTimeSeries,
        chartFields,
        visualizationInfo: aspects["visualization-info"]
            ? aspects["visualization-info"]
            : null,
        compatiblePreviews,
        sourceDetails: aspects["source"]
    };
}

export function parseDataset(dataset?: RawDataset): ParsedDataset {
    let error = null;
    if (dataset && !dataset.id) {
        error = { title: "Error", detail: dataset.message || "Error occurred" };
    }
    const aspects = dataset
        ? Object.assign({}, defaultDatasetAspects, dataset["aspects"])
        : defaultDatasetAspects;
    const identifier = dataset ? dataset.id : null;
    const datasetInfo = aspects["dcat-dataset-strings"];
    const distribution = aspects["dataset-distributions"];
    const temporalCoverage = aspects["temporal-coverage"];
    const description = datasetInfo.description || "No description provided";
    const tags = datasetInfo.keywords || [];
    const landingPage = datasetInfo.landingPage || "";
    const title = datasetInfo.title || "";
    const issuedDate = getDateString(datasetInfo.issued) || null;
    const updatedDate = datasetInfo.modified
        ? getDateString(datasetInfo.modified)
        : null;
    const publisher = aspects["dataset-publisher"]
        ? aspects["dataset-publisher"]["publisher"]
        : defaultPublisher;
    const contactPoint: string = aspects["dcat-dataset-strings"].contactPoint;
    const source: string = aspects["source"]
        ? aspects["source"]["type"] !== "csv-dataset"
            ? aspects["source"]["name"]
            : undefined
        : defaultDatasetAspects["source"]["name"];

    function calcQuality(qualityAspect) {
        const ratings = Object.keys(qualityAspect)
            .map(key => qualityAspect[key])
            .map(aspectRating => [aspectRating.score, aspectRating.weighting]);
        return weightedMean(ratings);
    }

    const linkedDataRating: number = aspects["dataset-quality-rating"]
        ? calcQuality(aspects["dataset-quality-rating"])
        : 0;
    const hasQuality: boolean = aspects["dataset-quality-rating"]
        ? true
        : false;

    const distributions = distribution["distributions"].map(d => {
        const distributionAspects = Object.assign(
            {},
            defaultDistributionAspect,
            d["aspects"]
        );
        const info = distributionAspects["dcat-distribution-strings"];
        const linkStatus = distributionAspects["source-link-status"];
        const visualizationInfo = distributionAspects["visualization-info"];

        const isTimeSeries =
            distributionAspects["visualization-info"]["timeseries"];
        let chartFields = null;
        if (isTimeSeries) {
            const fields = distributionAspects["visualization-info"].fields;
            const timeFields = Object.keys(fields).filter(
                f => fields[f].time === true
            );
            const numericFields = Object.keys(fields).filter(
                f => fields[f].numeric === true
            );
            chartFields = {
                time: timeFields,
                numeric: numericFields
            };
        }
        const format = getFormatString(distributionAspects);
        const compatiblePreviews =
            distributionAspects["visualization-info"].compatiblePreviews ||
            guessCompatiblePreviews(format, isTimeSeries);
        return {
            identifier: d["id"],
            title: d["name"],
            downloadURL: info.downloadURL || null,
            accessURL: info.accessURL || null,
            format,
            license:
                !info.license || info.license === "notspecified"
                    ? "License restrictions unknown"
                    : info.license,
            description: info.description || "No description provided",
            linkStatusAvailable: Boolean(linkStatus.status), // Link status is available if status is non-empty string
            linkActive: linkStatus.status === "active",
            updatedDate: info.modified ? getDateString(info.modified) : null,
            isTimeSeries: visualizationInfo["timeseries"],
            chartFields,
            compatiblePreviews,
            visualizationInfo: visualizationInfo ? visualizationInfo : null,
            sourceDetails: distributionAspects["source"]
        };
    });
    return {
        identifier,
        title,
        issuedDate,
        updatedDate,
        landingPage,
        contactPoint,
        tags,
        description,
        distributions,
        source,
        temporalCoverage,
        publisher,
        error,
        linkedDataRating,
        hasQuality,
        sourceDetails: aspects["source"],
        creation: datasetInfo["creation"]
    };
}
