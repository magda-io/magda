// @flow
import getDateString from "./getDateString";
// dataset query:
//aspect=dcat-dataset-strings&optionalAspect=dcat-distribution-strings&optionalAspect=dataset-distributions&optionalAspect=temporal-coverage&dereference=true&optionalAspect=dataset-publisher&optionalAspect=source

export type RecordAction = {
    json?: Object,
    error?: number,
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
            wellFormed: boolean
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
    updatedDate: string,
    license: string,
    linkActive: boolean,
    linkStatusAvailable: boolean,
    isTimeSeries: boolean,
    chartFields?: ?Object
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
    error: ?string
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
            description: ""
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
        wellFormed: false
    }
};

export function parseDistribution(
    record?: RawDistribution
): ParsedDistribution {
    const identifier = record ? record["id"] : "";
    const title = record ? record["name"] : "";

    const aspects = record
        ? Object.assign({}, defaultDistributionAspect, record["aspects"])
        : defaultDistributionAspect;

    const info = aspects["dcat-distribution-strings"];

    const format = info.format || "Unknown format";
    const downloadURL = info.downloadURL || null;
    const accessURL = info.accessURL || null;
    const updatedDate = info.modified
        ? getDateString(info.modified)
        : "unknown date";
    const license = info.license || "License restrictions unknown";
    const description = info.description || "No description provided";
    const linkStatus = aspects["source-link-status"];
    const linkStatusAvailable = Boolean(linkStatus.status); // Link status is available if status is non-empty string
    const linkActive = linkStatus.status === "active";
    const isTimeSeries = aspects["visualization-info"]["timeseries"];
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
        updatedDate,
        license,
        linkStatusAvailable,
        linkActive,
        isTimeSeries,
        chartFields
    };
}

export function parseDataset(dataset?: RawDataset): ParsedDataset {
    let error = null;
    if (dataset && !dataset.id) {
        error = dataset.message || "Error occurred";
    }
    const aspects = dataset
        ? Object.assign({}, defaultDatasetAspects, dataset["aspects"])
        : defaultDatasetAspects;
    const identifier = dataset ? dataset.id : "";
    const datasetInfo = aspects["dcat-dataset-strings"];
    const distribution = aspects["dataset-distributions"];
    const temporalCoverage = aspects["temporal-coverage"];
    const description = datasetInfo.description || "No description provided";
    const tags = datasetInfo.keywords || [];
    const landingPage = datasetInfo.landingPage || "";
    const title = datasetInfo.title || "";
    const issuedDate = datasetInfo.issued || "Unknown issued date";
    const updatedDate = datasetInfo.modified
        ? getDateString(datasetInfo.modified)
        : "unknown date";
    const publisher = aspects["dataset-publisher"]
        ? aspects["dataset-publisher"]["publisher"]
        : defaultPublisher;

    const source: string = aspects["source"]
        ? aspects["source"]["name"]
        : defaultDatasetAspects["source"]["name"];

    const distributions = distribution["distributions"].map(d => {
        const distributionAspects = Object.assign(
            {},
            defaultDistributionAspect,
            d["aspects"]
        );
        const info = distributionAspects["dcat-distribution-strings"];
        const linkStatus = distributionAspects["source-link-status"];
        const visualizationInfo = distributionAspects["visualization-info"];
        return {
            identifier: d["id"],
            title: d["name"],
            downloadURL: info.downloadURL || null,
            accessURL: info.accessURL || null,
            format: info.format || "Unknown format",
            license:
                !info.license || info.license === "notspecified"
                    ? "License restrictions unknown"
                    : info.license,
            description: info.description || "No description provided",
            linkStatusAvailable: Boolean(linkStatus.status), // Link status is available if status is non-empty string
            linkActive: linkStatus.status === "active",
            updatedDate: info.modified
                ? getDateString(info.modified)
                : "unknown date",
            isTimeSeries: visualizationInfo["timeseries"]
        };
    });
    return {
        identifier,
        title,
        issuedDate,
        updatedDate,
        landingPage,
        tags,
        description,
        distributions,
        source,
        temporalCoverage,
        publisher,
        error
    };
}
