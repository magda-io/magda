import getDateString from "./getDateString";
import { isSupportedFormat as isSupportedMapPreviewFormat } from "../Components/Common/DataPreviewMap";
import { FetchError } from "../types";
import weightedMean from "weighted-mean";
import {
    Record,
    VersionAspectData,
    CurrencyData
} from "api-clients/RegistryApis";
import { config } from "config";

export type RecordAction = {
    json?: any;
    error?: FetchError;
    type?: string;
    id?: string;
};

export type TemporalCoverage = {
    intervals: {
        start?: string;
        end?: string;
        startIndeterminate?: "unknown" | "now" | "before" | "after";
        endIndeterminate?: "unknown" | "now" | "before" | "after";
    }[];
};

export type sourceAspect = {
    name: string;
    url: string;
    type: string;
    id: string;
    // only avaiable when dataset is not crawled from original source
    originalName?: string;
    originalUrl?: string;
    problems?: {
        title: string;
        message: string;
        additionalInfo?: any;
    }[];
    extras?: {
        [key: string]: any;
    };
};

export type dcatDistributionStrings = {
    format: string;
    downloadURL: string;
    accessURL: string;
    issued?: string;
    modified: string;
    license: string;
    description: string;
    title: string;
};

export type DcatDatasetStrings = {
    title: string;
    description: string;
    issued?: string;
    modified?: string;
    languages?: string[];
    publisher?: string;
    accrualPeriodicity?: string;
    accrualPeriodicityRecurrenceRule?: string;
    spatial?: string;
    temporal?: {
        start?: string;
        end?: string;
    };
    themes?: string[];
    keywords?: Array<string>;
    contactPoint?: string;
    landingPage?: string;
    defaultLicense?: string;
};

export type Publisher = {
    id: string;
    name: string;
    message?: string;
    aspects: {
        source?: {
            url: string;
            type: string;
        };
        "organization-details"?: {
            name: string;
            title: string;
            imageUrl: string;
            description: string;
        };
    };
};

export type DatasetPublisher = {
    publisher: Publisher;
};

type CompatiblePreviews = {
    map?: boolean;
    chart?: boolean;
    table?: boolean;
    json?: boolean;
    html?: boolean;
    text?: boolean;
    rss?: boolean;
    google?: boolean;
};

//aspect=dcat-distribution-strings
export type RawDistribution = {
    id: string;
    name: string;
    aspects: {
        "dcat-distribution-strings": dcatDistributionStrings;
        "source-link-status": {
            status?: string;
        };
        "visualization-info": {
            fields: any;
            format: string;
            timeseries: boolean;
            wellFormed: boolean;
            compatiblePreviews: CompatiblePreviews;
        };
        "spatial-coverage": {
            bbox?: number[];
        };
        publishing: {
            state?: string;
        };
        version?: VersionAspectData;
    };
};

type Provenance = {
    mechanism?: string;
    sourceSystem?: string;
    derivedFrom?: {
        id?: string[];
        name?: string;
    }[];
    isOpenData?: boolean;
    affiliatedOrganizationIds?: Record[];
};

export type Access = {
    location?: string;
    useStorageApi?: boolean;
    note?: string;
};

export type DatasetDraft = {
    data: string;
    timestamp: string;
    dataset?: {
        title?: string;
        description?: string;
        themes?: string[];
        keywords?: string[];
    };
};

export type PublishingAspect = {
    custodianOrgUnitId?: string;
    managingOrgUnitId?: string;
    state?: "draft" | "published" | "archived";
    level?:
        | "organization"
        | "custodian"
        | "team"
        | "creatorOrgUnit"
        | "selectedOrgUnit";
    contactPointDisplay?: "team" | "organization" | "custodian";
    publishAsOpenData?: {
        [key: string]: any;
    };
};

export type RawDataset = {
    id: string;
    name: string;
    message?: string;
    aspects: {
        "dcat-dataset-strings": DcatDatasetStrings;
        source?: {
            url: string;
            name: string;
            type: string;
        };
        "dataset-publisher"?: DatasetPublisher;
        "dataset-distributions"?: {
            distributions: Array<RawDistribution>;
        };
        "temporal-coverage"?: TemporalCoverage;
        provenance?: Provenance;
        access: Access;
        version?: VersionAspectData;
        "dataset-draft"?: DatasetDraft;
        currency?: CurrencyData;
        publishing?: PublishingAspect;
    };
};

export type ParsedDistribution = {
    identifier?: string;
    title: string;
    description: string;
    format: string;
    downloadURL?: string;
    accessURL?: string;
    updatedDate?: string;
    license: string | any;
    linkActive: boolean;
    linkStatusAvailable: boolean;
    isTimeSeries: boolean;
    chartFields?: any;
    compatiblePreviews: CompatiblePreviews;
    accessNotes?: string;
    visualizationInfo: any;
    sourceDetails: any;
    ckanResource: any;
    version?: VersionAspectData;
};

export type ParsedProvenance = {
    mechanism?: string;
    sourceSystem?: string;
    derivedFrom?: string;
    affiliatedOrganizations?: Record[];
    isOpenData?: boolean;
};

export type ParsedInformationSecurity = {
    disseminationLimits: string[];
    classification: string;
};

// all aspects become required and must have value
export type ParsedDataset = {
    identifier?: string;
    title: string;
    accrualPeriodicity?: string;
    accrualPeriodicityRecurrenceRule?: string;
    currency?: CurrencyData;
    issuedDate?: string;
    updatedDate?: string;
    landingPage: string;
    tags: Array<string>;
    description: string;
    distributions: Array<ParsedDistribution>;
    temporalCoverage?: TemporalCoverage;
    themes: string[];
    publisher: Publisher;
    source?: string;
    linkedDataRating: number;
    contactPoint: string;
    error?: FetchError;
    hasQuality?: boolean;
    sourceDetails?: any;
    provenance?: ParsedProvenance;
    publishingState?: string;
    spatialCoverageBbox?: any;
    temporalExtent?: any;
    accessLevel?: string;
    informationSecurity?: ParsedInformationSecurity;
    accessControl?: {
        ownerId: string;
        orgUnitId: string;
        preAuthorisedPermissionIds: string[];
    };
    ckanExport?: CkanExportAspectType;
    access: Access;
};

export const emptyPublisher: Publisher = {
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
    "dataset-publisher": { publisher: emptyPublisher },
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
    const identifier = record && record["id"];
    const title = record ? record["name"] : "";

    const aspects: any = record
        ? Object.assign({}, defaultDistributionAspect, record["aspects"])
        : defaultDistributionAspect;

    const info = aspects["dcat-distribution-strings"];

    const format = getFormatString(aspects);
    const downloadURL = info.downloadURL;
    const accessURL = info.accessURL;
    const accessNotes = info.accessNotes;
    const updatedDate = info.modified && getDateString(info.modified);
    const license = info.license || "Licence restrictions unknown";
    const description = info.description || "No description provided";
    const linkStatus = aspects["source-link-status"];
    const linkStatusAvailable = Boolean(linkStatus.status); // Link status is available if status is non-empty string
    const linkActive = linkStatus.status === "active";
    const isTimeSeries = aspects["visualization-info"]["timeseries"];
    const compatiblePreviews =
        aspects["visualization-info"].compatiblePreviews ||
        guessCompatiblePreviews(format, isTimeSeries);
    let chartFields: any = null;

    if (isTimeSeries) {
        const fields = aspects["visualization-info"].fields;
        const timeFields = Object.keys(fields).filter(
            (f) => fields[f].time === true
        );
        const numericFields = Object.keys(fields).filter(
            (f) => fields[f].numeric === true
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
        sourceDetails: aspects["source"],
        ckanResource: aspects["ckan-resource"],
        version: aspects["version"]
    };
}

type CkanExportStatus = "withdraw" | "retain";
export interface CkanExportAspectProperties {
    status: CkanExportStatus;
    exportUserId?: string;
    ckanId?: string;
    hasCreated: boolean;
    exportRequired: boolean;
    exportAttempted: boolean;
    lastExportAttemptTime?: Date;
    exportError?: string;
}

export interface CkanExportAspectType {
    [key: string]: CkanExportAspectProperties;
}

export function parseDataset(dataset?: RawDataset): ParsedDataset {
    let error;
    if (dataset && !dataset.id) {
        error = { title: "Error", detail: dataset.message || "Error occurred" };
    }
    const aspects: any = dataset
        ? Object.assign({}, defaultDatasetAspects, dataset["aspects"])
        : defaultDatasetAspects;
    const identifier = dataset && dataset.id;
    const accessControl = aspects["access-control"];
    const datasetInfo = aspects["dcat-dataset-strings"];
    const distribution = aspects["dataset-distributions"];
    const temporalCoverage = aspects["temporal-coverage"] || { intervals: [] };
    const spatialCoverage = aspects["spatial-coverage"] || {};
    const description = datasetInfo.description || "No description provided";
    const tags = datasetInfo.keywords || [];
    const landingPage = datasetInfo.landingPage || "";
    const title = datasetInfo.title || "";
    const issuedDate = datasetInfo.issued && getDateString(datasetInfo.issued);
    const updatedDate =
        datasetInfo.modified && getDateString(datasetInfo.modified);

    const publishing = aspects["publishing"] || {};
    const publisher = aspects["dataset-publisher"]
        ? aspects["dataset-publisher"]["publisher"]
            ? aspects["dataset-publisher"]["publisher"]
            : emptyPublisher
        : emptyPublisher;
    const contactPoint: string = datasetInfo.contactPoint;
    const source: string | undefined = aspects["source"]
        ? aspects["source"]["type"] !== "csv-dataset"
            ? aspects["source"]["name"]
            : undefined
        : defaultDatasetAspects["source"]["name"];

    function calcQuality(qualityAspect) {
        const ratings = Object.keys(qualityAspect)
            .map((key) => qualityAspect[key])
            .map((aspectRating) => [
                aspectRating.score,
                aspectRating.weighting
            ]);
        return weightedMean(ratings);
    }

    const linkedDataRating: number = aspects["dataset-quality-rating"]
        ? calcQuality(aspects["dataset-quality-rating"])
        : 0;
    const hasQuality: boolean = aspects["dataset-quality-rating"]
        ? true
        : false;

    const ckanExport: CkanExportAspectType = aspects["ckan-export"]
        ? aspects["ckan-export"]
        : {
              [config.defaultCkanServer]: {
                  status: "withdraw",
                  hasCreated: false,
                  exportRequired: false,
                  exportAttempted: false
              }
          };

    const distributions = distribution["distributions"].map((d) => {
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
        let chartFields;
        if (isTimeSeries) {
            const fields = distributionAspects["visualization-info"].fields;
            const timeFields = Object.keys(fields).filter(
                (f) => fields[f].time === true
            );
            const numericFields = Object.keys(fields).filter(
                (f) => fields[f].numeric === true
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
                    ? "Licence restrictions unknown"
                    : info.license,
            description: info.description || "No description provided",
            linkStatusAvailable: Boolean(linkStatus.status), // Link status is available if status is non-empty string
            linkActive: linkStatus.status === "active",
            updatedDate: info.modified ? getDateString(info.modified) : null,
            isTimeSeries: visualizationInfo["timeseries"],
            chartFields,
            compatiblePreviews,
            visualizationInfo: visualizationInfo ? visualizationInfo : null,
            sourceDetails: distributionAspects["source"],
            ckanResource: distributionAspects["ckan-resource"]
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
        currency: aspects?.["currency"],
        themes: datasetInfo["themes"],
        sourceDetails: aspects["source"],
        provenance: {
            ...(aspects?.provenance ? aspects.provenance : {}),
            affiliatedOrganizations:
                aspects?.provenance?.affiliatedOrganizationIds
        },
        publishingState: publishing["state"],
        spatialCoverageBbox: spatialCoverage["bbox"],
        temporalExtent: datasetInfo["temporal"] || {},
        accessLevel: datasetInfo["accessLevel"],
        informationSecurity: aspects["information-security"] || {},
        accessControl,
        accrualPeriodicity: datasetInfo["accrualPeriodicity"] || "",
        accrualPeriodicityRecurrenceRule:
            datasetInfo["accrualPeriodicityRecurrenceRule"] || "",
        ckanExport,
        access: aspects["access"]
    };
}
