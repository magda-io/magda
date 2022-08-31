import { v4 as uuidv4 } from "uuid";

import { ContactPointDisplayOption } from "constants/DatasetConstants";
import {
    fetchOrganization,
    fetchRecordWithNoCache,
    doesRecordExist,
    createDataset,
    ensureAspectExists,
    createPublisher,
    updateDataset,
    deleteRecordAspect,
    deleteRecord,
    Record,
    getInitialVersionAspectData,
    VersionAspectData,
    updateRecordAspect,
    patchRecord,
    tagRecordVersionEventId,
    VersionItem
} from "api-clients/RegistryApis";
import { config } from "config";
import { User } from "reducers/userManagementReducer";
import { RawDataset, DatasetDraft, RawDistribution } from "helpers/record";
import { autocompletePublishers } from "api-clients/SearchApis";
import ServerError from "@magda/typescript-common/dist/ServerError";
import defer from "helpers/defer";
import { ReactStateUpdaterType } from "helpers/promisifySetState";
import getDistInfoFromDownloadUrl from "./Pages/AddFiles/getDistInfoFromDownloadUrl";
import deleteFile from "./Pages/AddFiles/deleteFile";
import escapeJsonPatchPointer from "helpers/escapeJsonPatchPath";
import uniq from "lodash/uniq";
import {
    indexDatasetById,
    deleteDatasetIndexById
} from "api-clients/IndexerApis";

export type Distribution = {
    title: string;
    description?: string;
    issued?: Date;
    modified: Date;
    license?: string;
    rights?: string;
    accessURL?: string;
    accessNotes?: string;
    downloadURL?: string;
    byteSize?: number;
    mediaType?: string;
    format?: string;

    datasetTitle?: string;
    author?: string;
    keywords?: string[];
    themes?: string[];
    temporalCoverage?: TemporalCoverage;
    spatialCoverage?: SpatialCoverage;

    similarFingerprint?: any;
    equalHash?: string;

    /**
     * An UUID for identify a file during the processing. array index is not a reliable id.
     *
     * @type {string}
     */
    id?: string;
    creationSource?: DistributionSource;
    creationMethod?: DistributionCreationMethod;

    /**
     * whether it's a distribution that the user hasn't comfirm (by clicking `Finishing Adding` button in Edit flow) that it should be added to dataset
     *
     * @type {boolean}
     */
    isAddConfirmed?: boolean;

    /**
     * whether it's a distribution user yet to confirm it should be replace existing distribution or not
     *
     * @type {boolean}
     */
    isReplacementConfirmed?: boolean;
    replaceDistId?: string;
    _state: DistributionState;
    _progress?: number;

    /**
     * whether the file is stored with internal storage API
     *
     * @type {boolean}
     */
    useStorageApi: boolean;

    /**
     * we use raw aspect data as we don't access version create time often
     *
     * @type {VersionAspectData}
     */
    version?: VersionAspectData;
};

export enum DistributionSource {
    File,
    DatasetUrl,
    Api
}

export enum DistributionCreationMethod {
    Manual,
    Auto
}

export enum DistributionState {
    Added,
    Reading,
    Processing,
    Ready,
    Drafting,
    Deleting
}

export function distributionStateToText(state: DistributionState) {
    switch (state) {
        case DistributionState.Added:
            return "Added";
        case DistributionState.Reading:
            return "Reading";
        case DistributionState.Processing:
            return "Processing";
        case DistributionState.Ready:
            return "Ready";
        case DistributionState.Deleting:
            return "Deleting";
        default:
            return "Unknown";
    }
}

export type DatasetAutocompleteChoice = {
    existingId?: string;
    name: string;
    shouldShowTooltip?: boolean;
};

export type OrganisationAutocompleteChoice = {
    existingId?: string;
    name: string;
};

export type KeywordsLike = {
    keywords: string[];
    derived: boolean;
};

export type Dataset = {
    title: string;
    description?: string;
    issued?: Date;
    modified?: Date;
    languages?: string[];
    publisher?: OrganisationAutocompleteChoice;
    accrualPeriodicity?: string;
    themes?: KeywordsLike;
    keywords?: KeywordsLike;
    defaultLicense?: string;

    accrualPeriodicityRecurrenceRule?: string;
    ownerId?: string; // --- actual owner of the dataset; Initially set to same as `editingUserId` but can be changed to different user.
    editingUserId?: string; // --- always populate with current logged-in user id (if available)
    owningOrgUnitId?: string;
    contactPointDisplay?: string;
    landingPage?: string;
    importance?: string;
};

export type Provenance = {
    mechanism?: string;
    sourceSystem?: string;
    derivedFrom?: DatasetAutocompleteChoice[];
    affiliatedOrganizations?: OrganisationAutocompleteChoice[];
    isOpenData?: boolean;
};

export type DatasetPublishing = {
    state?: string;
    level?: string;
    custodianOrgUnitId?: string;
    managingOrgUnitId?: string;
    notesToApprover?: string;
    contactPointDisplay?: ContactPointDisplayOption;
    publishAsOpenData?: {
        [key: string]: boolean;
    };
};

export type SpatialCoverage = {
    bbox?: [number, number, number, number];
    spatialDataInputMethod?: "bbox" | "region" | "map";
    lv1Id?: string;
    lv2Id?: string;
    lv3Id?: string;
    lv4Id?: string;
    lv5Id?: string;
};

type InformationSecurity = {
    disseminationLimits?: string[];
    classification?: string;
};

export type CurrentStatusType = "CURRENT" | "SUPERSEDED" | "RETIRED";

type Currency = {
    status: CurrentStatusType;
    supersededBy?: DatasetAutocompleteChoice[];
    retireReason?: string;
};

export type State = {
    distributions: Distribution[];

    /**
     * This field will be prepopulated with all distributions ids of the dataset when open the editor initially.
     * A clean up routine will be run during the dataset submit process to delete all distributions are deleted.
     * i.e. any ids contained in this array but cannot find from the distributions array.
     *
     * @type {string[]}
     */
    involvedDistributionIds: string[];
    dataset: Dataset;
    datasetPublishing: DatasetPublishing;
    processing: boolean;
    spatialCoverage: SpatialCoverage;
    temporalCoverage: TemporalCoverage;
    datasetAccess: Access;
    informationSecurity: InformationSecurity;
    provenance: Provenance;
    currency: Currency;
    version?: VersionAspectData;

    _lastModifiedDate: Date;
    _createdDate: Date;

    /**
     * We use this fields to track all uploaded files before submit. This info will only be saved to `dataset-draft`.
     * Unless the user specifically asks for it, we will only clean this info (and also `dataset-draft`) after dataset changes are submited.
     * When the user wants to discard all previous changes (that not submitted yet), we should use this array to double check if any orphan files
     * (files are not belongs to any distributions --- could be produced by unsubmitted replacement or supercedure changes) are required to be deleted.
     * This field store uploaded file urls
     */
    uploadedFileUrls: string[];

    /**
     * `dataset-draft` aspect data
     * A user may choose to recover from previous saved changes in edit workflow.
     * Thus, we should not auto unserialize the data here and recover `State` whitout asking the user.
     * After we recover the previous saved state, we should set this `datasetDraft` field to undefined.
     * When the user choose to discard the previous saved draft changes, `uploadedFiles` above should be examined to removed any orphan files.
     * When save state to `dataset-draft`, this field should be omitted.
     */
    datasetDraft?: DatasetDraft;
    loadDatasetDraftConfirmed: boolean;

    licenseLevel: "dataset" | "distribution";

    isPublishing: boolean;
    error: Error | null;
};

export type DatasetStateUpdaterType = ReactStateUpdaterType<State>;

export const getDistributionDeleteCallback = (
    datasetStateUpdater: DatasetStateUpdaterType
) => (distId: string) =>
    new Promise<void>((resolve, reject) => {
        datasetStateUpdater(
            (state) => ({
                ...state,
                distributions: state.distributions.filter(
                    (item) => item.id !== distId
                )
            }),
            resolve
        );
    });

export const getDistributionAddCallback = (
    datasetStateUpdater: DatasetStateUpdaterType
) => (dist: Distribution) =>
    new Promise<void>((resolve, reject) => {
        datasetStateUpdater(
            (state) => ({
                ...state,
                distributions: [...state.distributions, dist]
            }),
            resolve
        );
    });

export const getDistributionUpdateCallback = (
    datasetStateUpdater: DatasetStateUpdaterType
) => (
    distId: string,
    dist: ((prevState: Readonly<Distribution>) => Distribution) | Distribution
) =>
    new Promise<void>((resolve, reject) => {
        datasetStateUpdater((state) => {
            try {
                return {
                    ...state,
                    distributions: state.distributions.map((item) =>
                        item.id !== distId
                            ? item
                            : typeof dist === "function"
                            ? dist(item)
                            : dist
                    )
                };
            } catch (e) {
                reject(e);
                return state;
            }
        }, resolve);
    });

export type TemporalCoverage = {
    intervals: Interval[];
};

export type Interval = {
    start?: Date;
    end?: Date;
};

type Access = {
    location?: string;
    useStorageApi: boolean;
    notes?: string;
};

function getInternalDatasetSourceAspectData() {
    return {
        id: "magda",
        name: "This Magda metadata creation tool",
        type: "internal",
        url: config.baseExternalUrl
    };
}

function getAccessControlAspectData(state: State) {
    const { dataset } = state;
    return {
        ownerId: dataset.ownerId
            ? dataset.ownerId
            : dataset.editingUserId
            ? dataset.editingUserId
            : undefined,
        orgUnitId: dataset.owningOrgUnitId ? dataset.owningOrgUnitId : undefined
    };
}

function getPublishingAspectData(state: State) {
    const { datasetPublishing } = state;
    return {
        ...datasetPublishing
    };
}

function dateStringToDate(dateInput: any): Date | null {
    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
        return dateInput;
    }
    if (!dateInput || typeof dateInput !== "string") {
        return null;
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) {
        return null;
    }
    return d;
}

function populateDcatDatasetStringAspect(data: RawDataset, state: State) {
    const datasetDcatString = data?.aspects["dcat-dataset-strings"];
    if (!datasetDcatString) {
        return;
    }
    state.dataset = {
        ...state.dataset,
        title: datasetDcatString.title,
        description: datasetDcatString.description
    };

    if (typeof datasetDcatString?.languages === "string") {
        state.dataset.languages = [datasetDcatString.languages];
    } else if (datasetDcatString?.languages?.length) {
        state.dataset.languages = datasetDcatString.languages;
    }

    if (datasetDcatString?.accrualPeriodicity) {
        state.dataset.accrualPeriodicity = datasetDcatString.accrualPeriodicity;
    }

    if (datasetDcatString?.accrualPeriodicityRecurrenceRule) {
        state.dataset.accrualPeriodicityRecurrenceRule =
            datasetDcatString.accrualPeriodicityRecurrenceRule;
    }

    const issuedDate = dateStringToDate(datasetDcatString?.issued);
    if (issuedDate) {
        state.dataset.issued = issuedDate;
    }

    const modifiedDate = dateStringToDate(datasetDcatString?.modified);
    if (modifiedDate) {
        state.dataset.modified = modifiedDate;
    }

    if (datasetDcatString?.keywords?.length) {
        state.dataset.keywords = {
            derived: false,
            keywords: datasetDcatString?.keywords
        };
    }

    if (datasetDcatString?.themes?.length) {
        state.dataset.themes = {
            derived: false,
            keywords: datasetDcatString?.themes
        };
    }

    if (datasetDcatString?.defaultLicense) {
        state.dataset.defaultLicense = datasetDcatString?.defaultLicense;
    }

    if (data.aspects?.["access-control"]?.ownerId) {
        state.dataset.ownerId = data.aspects?.["access-control"]?.ownerId;
    }

    if (data.aspects?.["access-control"]?.orgUnitId) {
        state.dataset.owningOrgUnitId =
            data.aspects?.["access-control"]?.orgUnitId;
    }
}

function populateDatasetPublisherAspect(data: RawDataset, state: State) {
    const publisher = data.aspects?.["dataset-publisher"]?.publisher;

    if (publisher) {
        state.dataset.publisher = {
            name: publisher?.name,
            existingId: publisher.id
        };
    }
}

function populateTemporalCoverageAspect(data: RawDataset, state: State) {
    if (!data.aspects?.["temporal-coverage"]?.intervals?.length) {
        return;
    }
    const intervals = data.aspects["temporal-coverage"].intervals
        .map((item) => ({
            start: dateStringToDate(item.start),
            end: dateStringToDate(item.end)
        }))
        .filter((item) => item.start || item.end);

    if (intervals.length) {
        state.temporalCoverage = {
            intervals: intervals as Interval[]
        };
    }
}

async function getDatasetNameById(id): Promise<string> {
    try {
        // --- turn off cache
        const data = await fetchRecordWithNoCache(
            id,
            ["dcat-dataset-strings"],
            [],
            false
        );
        if (data?.aspects?.["dcat-dataset-strings"]?.title) {
            return data.aspects["dcat-dataset-strings"].title;
        } else {
            return data.name;
        }
    } catch (e) {
        console.log(e);
        return "";
    }
}

async function convertToDatasetAutoCompleteData(
    items: { id?: string[]; name?: string }[] | undefined
): Promise<DatasetAutocompleteChoice[] | undefined> {
    if (items?.length) {
        const result: DatasetAutocompleteChoice[] = [];
        for (let i = 0; i < items.length; i++) {
            let name = items[i]?.name;
            const id = items[i]?.id?.[0];
            if (!name && !id) {
                continue;
            }
            if (!name) {
                name = await getDatasetNameById(id);
            }
            const item: DatasetAutocompleteChoice = { name };
            if (id) {
                item.existingId = id;
            }
            result.push(item);
        }
        if (result.length) {
            return result;
        }
    }
    return;
}

async function populateProvenanceAspect(data: RawDataset, state: State) {
    if (
        !data?.aspects?.["provenance"] ||
        !Object.keys(data.aspects?.["provenance"])?.length
    ) {
        return;
    }

    const {
        derivedFrom,
        affiliatedOrganizationIds,
        ...restProps
    } = data.aspects["provenance"];

    const provenance = {
        ...restProps
    } as any;

    if (derivedFrom?.length) {
        provenance.derivedFrom = await convertToDatasetAutoCompleteData(
            derivedFrom
        );
    }

    if (affiliatedOrganizationIds?.length) {
        provenance.affiliatedOrganizations = affiliatedOrganizationIds.map(
            (item) => ({
                existingId: item.id,
                name: item?.aspects?.["organization-details"]?.title
                    ? item?.aspects?.["organization-details"]?.title
                    : item.name
            })
        );
    }

    state.provenance = provenance;
}

async function populateCurrencyAspect(data: RawDataset, state: State) {
    if (
        !data?.aspects?.["currency"] ||
        !Object.keys(data?.aspects?.["currency"])
    ) {
        return;
    }

    const { supersededBy, ...restCurrencyProps } = data.aspects["currency"];
    const currency = {
        ...restCurrencyProps,
        supersededBy: await convertToDatasetAutoCompleteData(supersededBy)
    };
    state.currency = currency;
}

function populateDistributions(data: RawDataset, state: State) {
    if (!data?.aspects?.["dataset-distributions"]?.distributions?.length) {
        return;
    }
    const distributions = data.aspects["dataset-distributions"].distributions
        .filter((item) => item?.aspects?.["dcat-distribution-strings"])
        .map((item) => {
            const modified = dateStringToDate(
                item?.aspects["dcat-distribution-strings"]?.modified
            );
            const issued = dateStringToDate(
                item?.aspects["dcat-distribution-strings"]?.issued
            );
            const dis = {
                ...item.aspects["dcat-distribution-strings"],
                id: item.id,
                modified: modified ? modified : new Date(),
                issued: issued ? issued : undefined,
                _state: DistributionState.Ready
            } as Distribution;

            if (item?.aspects?.version) {
                dis.version = item.aspects.version;
                if (dis.version?.versions?.length) {
                    dis.version.versions.forEach((ver) => {
                        if (ver.internalDataFileUrl) {
                            state.uploadedFileUrls.push(
                                ver.internalDataFileUrl
                            );
                        }
                    });
                }
            }

            if (dis.useStorageApi && dis.downloadURL) {
                // --- add local managed file URLs to state.uploadedFileUrls for future clean-up
                state.uploadedFileUrls.push(dis.downloadURL);
            }

            return dis;
        });
    if (distributions.length) {
        state.distributions = distributions;
        state.involvedDistributionIds = distributions.map((dis) => dis.id!);
    }

    state.uploadedFileUrls = uniq(state.uploadedFileUrls);
}

export async function rawDatasetDataToState(
    data: RawDataset,
    user: User
): Promise<State> {
    const state = createBlankState(user);

    populateDcatDatasetStringAspect(data, state);
    populateDatasetPublisherAspect(data, state);

    if (data.aspects?.["publishing"]) {
        state.datasetPublishing = data.aspects?.["publishing"];
    }

    if (data.aspects?.["spatial-coverage"]) {
        state.spatialCoverage = data.aspects?.["spatial-coverage"];
    }

    if (
        typeof data.aspects?.["ckan-export"]?.[config.defaultCkanServer]
            ?.status === "boolean"
    ) {
        /**
         * We need to populate data to state.datasetPublishing.publishAsOpenData.dga
         * as that's where frontend radio ctrl read the value but data.aspects?.["ckan-export"] contains the actual effective value.
         *
         * We probably should combined `state.ckan-export.[http://xxx.com].status` with `state.datasetPublishing.publishAsOpenData.dga`.
         * However, we will leave it to later now to avoid the trouble of implementing json path escape
         * (due to possible url as object key and we need access data via JSON path for ValidationManager)
         */
        if (!data.aspects?.["publishing"]) {
            data.aspects["publishing"] = {} as any;
        }
        data.aspects["publishing"] = {
            ...data.aspects["publishing"],
            publishAsOpenData: {
                ...(data.aspects["publishing"]?.publishAsOpenData
                    ? data.aspects["publishing"].publishAsOpenData
                    : {}),
                dga:
                    data.aspects["ckan-export"][config.defaultCkanServer].status
            }
        };
    }

    populateTemporalCoverageAspect(data, state);

    state.datasetAccess = {
        useStorageApi:
            typeof data?.aspects?.access?.useStorageApi === "boolean"
                ? data.aspects.access.useStorageApi
                : false
    };

    if (data.aspects?.["access"]?.location || data.aspects?.["access"]?.note) {
        state.datasetAccess = {
            ...state.datasetAccess,
            ...data.aspects.access
        };
    }

    if (data.aspects?.["information-security"]?.classification) {
        state.informationSecurity = data.aspects?.["information-security"];
    }

    populateProvenanceAspect(data, state);
    await populateCurrencyAspect(data, state);
    populateDistributions(data, state);

    state.licenseLevel = "dataset";

    if (state?.distributions?.length) {
        // --- if there is one distribution's license is different from dataset level
        // --- the state.licenseLevel should be distribution
        for (let i = 0; i < state.distributions.length; i++) {
            if (
                state.distributions[i].license !== state.dataset.defaultLicense
            ) {
                state.licenseLevel = "distribution";
                break;
            }
        }
    }

    if (data?.aspects?.version) {
        state.version = data.aspects.version;
    }

    if (data?.aspects?.["dataset-draft"]?.data) {
        state.datasetDraft = data.aspects["dataset-draft"];
    }

    return state;
}

export function createBlankState(user: User): State {
    return {
        distributions: [],
        involvedDistributionIds: [],
        processing: false,
        dataset: {
            title: "",
            languages: ["eng"],
            owningOrgUnitId: user ? user.orgUnitId : undefined,
            ownerId: user ? user.id : undefined,
            editingUserId: user ? user.id : undefined,
            defaultLicense: "No License",
            issued: new Date(),
            modified: new Date()
        },
        datasetPublishing: {
            state: "draft",
            level: "custodian",
            contactPointDisplay: "organization"
        },
        spatialCoverage: {
            // Australia, Mainland
            lv1Id: "1"
        },
        temporalCoverage: {
            intervals: []
        },
        datasetAccess: {
            useStorageApi: config.useMagdaStorageByDefault
        },
        informationSecurity: {},
        provenance: {},
        currency: {
            status: "CURRENT"
        },
        licenseLevel: "dataset",
        isPublishing: false,
        error: null,
        _createdDate: new Date(),
        _lastModifiedDate: new Date(),
        uploadedFileUrls: [] as string[],
        datasetDraft: undefined,
        loadDatasetDraftConfirmed: false
    };
}

export async function loadStateFromLocalStorage(
    id: string,
    user: User
): Promise<State> {
    const stateString = localStorage[id];
    let state: State;
    if (stateString) {
        const dehydrated = JSON.parse(stateString);
        state = {
            ...dehydrated,
            dataset: {
                ...dehydrated.dataset,
                modified: dehydrated.modified && new Date(dehydrated.modified),
                issued: dehydrated.issued && new Date(dehydrated.issued)
            }
        };
    } else {
        state = createBlankState(user);
    }

    if (
        !state.dataset.publisher &&
        typeof config.defaultOrganizationId !== "undefined"
    ) {
        // --- we turned off cache here
        const org = await fetchOrganization(config.defaultOrganizationId, true);
        state.dataset.publisher = {
            name: org.name,
            existingId: org.id
        };
    }

    return state;
}

export async function loadStateFromRegistry(
    id: string,
    user: User
): Promise<State> {
    let record: RawDataset | undefined;
    try {
        // --- we turned off cache here
        record = await fetchRecordWithNoCache(id, ["dataset-draft"], [], false);
    } catch (e) {
        if (!(e instanceof ServerError) || e.statusCode !== 404) {
            // --- mute 404 error as we're gonna create blank status if can't find an existing one
            throw e;
        }
    }

    let state: State | undefined;
    if (record?.aspects?.["dataset-draft"]?.data) {
        try {
            const dehydrated = JSON.parse(record.aspects["dataset-draft"].data);
            state = {
                ...dehydrated,
                dataset: {
                    ...dehydrated.dataset,
                    modified:
                        dehydrated.modified && new Date(dehydrated.modified),
                    issued: dehydrated.issued && new Date(dehydrated.issued)
                }
            };
        } catch (e) {
            console.error(e);
        }
    }

    if (!state) {
        state = createBlankState(user);
    }

    if (
        !state.dataset.publisher &&
        typeof config.defaultOrganizationId !== "undefined"
    ) {
        // --- we turned off cache here
        const org = await fetchOrganization(config.defaultOrganizationId, true);
        state.dataset.publisher = {
            name: org.name,
            existingId: org.id
        };
    }

    return state;
}

export async function loadState(id: string, user: User): Promise<State> {
    if (config?.featureFlags?.previewAddDataset) {
        // --- in preview mode, still save to local storage
        return await loadStateFromLocalStorage(id, user);
    } else {
        return await loadStateFromRegistry(id, user);
    }
}

export function saveStateToLocalStorage(state: State, id: string) {
    state = Object.assign({}, state);
    state.datasetDraft = undefined;
    state.loadDatasetDraftConfirmed = false;
    state._lastModifiedDate = new Date();
    state.error = null; // do not save error object

    const dataset = JSON.stringify(state);
    localStorage[id] = dataset;
    return id;
}

export async function saveStateToRegistry(state: State, id: string) {
    state = Object.assign({}, state);
    state.datasetDraft = undefined;
    state.loadDatasetDraftConfirmed = false;
    state._lastModifiedDate = new Date();
    state.error = null; // do not save error object

    const dataset = JSON.stringify(state);
    const timestamp = state._lastModifiedDate.toISOString();

    let record: RawDataset | undefined;
    try {
        // --- we turned off cache here
        // --- we won't check `dataset-draft` aspect as it's possible a dataset record with no dataset-draft exist (e.g. edit flow)
        record = await fetchRecordWithNoCache(id, [], ["publishing"], false);
    } catch (e) {
        if (!(e instanceof ServerError) || e.statusCode !== 404) {
            // --- mute 404 error as we're gonna create one if can't find an existing one
            throw e;
        }
    }

    const isDraft = record?.aspects?.["publishing"]?.state
        ? record.aspects["publishing"].state === "draft"
        : // when publishing aspect not exist assume it's published dataset
          false;

    let datasetDcatString;

    try {
        datasetDcatString = buildDcatDatasetStrings(state.dataset);
    } catch (e) {
        datasetDcatString = {};
    }

    const datasetDraftAspectData = {
        data: dataset,
        timestamp,
        dataset: {
            title: datasetDcatString?.title ? datasetDcatString.title : "",
            description: datasetDcatString?.description
                ? datasetDcatString.description
                : "",
            themes: datasetDcatString?.themes ? datasetDcatString.themes : [],
            keywords: datasetDcatString?.keywords
                ? datasetDcatString.keywords
                : []
        }
    };

    const dcatDatasetStrinsAspectData = {
        ...datasetDcatString,
        title: datasetDcatString?.title ? datasetDcatString.title : "",
        description: datasetDcatString?.description
            ? datasetDcatString.description
            : "",
        themes: datasetDcatString?.themes ? datasetDcatString.themes : [],
        keywords: datasetDcatString?.keywords ? datasetDcatString.keywords : []
    };

    if (!record) {
        // --- dataset record not exist
        await createDataset(
            {
                id,
                name: "",
                aspects: {
                    publishing: getPublishingAspectData(state),
                    "access-control": getAccessControlAspectData(state),
                    source: getInternalDatasetSourceAspectData(),
                    "dcat-dataset-strings": dcatDatasetStrinsAspectData,
                    "dataset-draft": datasetDraftAspectData
                }
            },
            []
        );
    } else {
        await updateRecordAspect(id, "dataset-draft", datasetDraftAspectData);
        if (isDraft) {
            // for published dataset in editing mode, we don't want to update `dcat-dataset-strings` till published
            await updateRecordAspect(
                id,
                "dcat-dataset-strings",
                dcatDatasetStrinsAspectData
            );
        }
    }

    return id;
}

export async function saveState(state: State, id = createId()) {
    if (config?.featureFlags?.previewAddDataset) {
        // --- in preview mode, still save to local storage
        return saveStateToLocalStorage(state, id);
    } else {
        return await saveStateToRegistry(state, id);
    }
}

/**
 * Save latest runtime state to storage.
 * Avoid saving outdated local copy of state
 * @param datasetId
 * @param datasetStateUpdater
 */
export function saveRuntimeStateToStorage(
    datasetId: string,
    datasetStateUpdater: DatasetStateUpdaterType
): Promise<string> {
    return new Promise((resolve, reject) => {
        datasetStateUpdater((state) => {
            // --- defer the execution to make sure the current updater return immediately
            defer(async () => {
                try {
                    const result = await saveState(state, datasetId);
                    resolve(result);
                } catch (e) {
                    reject(e);
                }
            });
            // --- return the same state to avoid updating state
            return state;
        });
    });
}

export function createId(type = "ds") {
    return `magda-${type}-${uuidv4()}`;
}

async function ensureBlankDatasetIsSavedToRegistry(
    state: State,
    id: string,
    name: string
) {
    if (!(await doesRecordExist(id))) {
        // --- if the dataset not exist in registry, save it now
        // --- the dataset should have the same visibility as the current one
        // --- but always be a draft one

        let datasetDcatString;

        try {
            datasetDcatString = buildDcatDatasetStrings(state.dataset);
        } catch (e) {
            datasetDcatString = {};
        }

        const dcatDatasetStrinsAspectData = {
            ...datasetDcatString,
            title: datasetDcatString?.title ? datasetDcatString.title : "",
            description: datasetDcatString?.description
                ? datasetDcatString.description
                : "",
            themes: datasetDcatString?.themes ? datasetDcatString.themes : [],
            keywords: datasetDcatString?.keywords
                ? datasetDcatString.keywords
                : []
        };

        await createDataset(
            {
                id,
                name,
                aspects: {
                    publishing: getPublishingAspectData(state),
                    "access-control": getAccessControlAspectData(state),
                    source: getInternalDatasetSourceAspectData(),
                    "dcat-dataset-strings": dcatDatasetStrinsAspectData
                }
            },
            []
        );
    }
}

/**
 * Convert data produced by `DatasetAutocomplete` dropdown box to a format that can be saved to the registry.
 * If `choices` parameters is empty (or `undefined`), this function simply return `undefined`.
 * This function also create a blank dataset record in registry only if the draft dataset has not been saved to registry yet.
 *
 * @export
 * @param {State} state
 * @param {DatasetAutocompleteChoice[]} [choices]
 * @returns {(Promise<
 *     | {
 *           id?: string[];
 *           name?: string;
 *       }[]
 *     | undefined
 * >)}
 */
export async function preProcessDatasetAutocompleteChoices(
    state: State,
    choices?: DatasetAutocompleteChoice[]
): Promise<
    | {
          id?: string[];
          name?: string;
      }[]
    | undefined
> {
    if (!choices?.length) {
        return;
    }
    const result: {
        id?: string[];
        name?: string;
    }[] = [];
    for (let i = 0; i < choices.length; i++) {
        const id = choices[i]?.existingId;
        const name = choices[i]?.name;
        if (!id && !name) {
            continue;
        }
        if (id && name) {
            await ensureBlankDatasetIsSavedToRegistry(
                state,
                id as string,
                name
            );
        }
        result.push({
            id: id ? [id] : undefined,
            name: !id ? name : undefined
        });
    }
    if (!result.length) {
        return;
    }
    return result;
}

function buildDcatDatasetStrings(value: Dataset) {
    return {
        title: value?.title,
        description: value?.description,
        issued: value?.issued?.toISOString && value.issued.toISOString(),
        modified: value?.modified?.toISOString && value.modified.toISOString(),
        languages: value?.languages,
        publisher: value?.publisher?.name,
        accrualPeriodicity: value?.accrualPeriodicity,
        accrualPeriodicityRecurrenceRule:
            value?.accrualPeriodicityRecurrenceRule,
        themes: value?.themes?.keywords,
        keywords: value?.keywords?.keywords,
        defaultLicense: value?.defaultLicense
    };
}

async function getOrgIdFromAutocompleteChoice(
    organization: OrganisationAutocompleteChoice
) {
    let orgId: string;
    if (!organization.existingId) {
        // Do a last check to make sure the publisher really doesn't exist
        const existingPublishers = await autocompletePublishers(
            {},
            organization.name
        );

        const match = existingPublishers.options.find(
            (publisher) =>
                publisher.value.toLowerCase().trim() ===
                organization!.name.toLowerCase().trim()
        );

        if (!match) {
            // OK no publisher, lets add it
            await ensureAspectExists("organization-details");

            orgId = uuidv4();
            await createPublisher({
                id: orgId,
                name: organization.name,
                aspects: {
                    "organization-details": {
                        name: organization.name,
                        title: organization.name,
                        imageUrl: "",
                        description: "Added manually during dataset creation"
                    }
                }
            });
        } else {
            orgId = match.identifier;
        }
    } else {
        orgId = organization.existingId;
    }

    return orgId;
}

async function convertStateToDatasetRecord(
    datasetId: string,
    distributionRecords: Record[],
    state: State,
    setState: React.Dispatch<React.SetStateAction<State>>,
    isUpdate: boolean = false
): Promise<Record> {
    const {
        dataset,
        spatialCoverage,
        temporalCoverage,
        informationSecurity,
        datasetAccess,
        provenance,
        currency
    } = state;

    let publisherId;
    if (dataset.publisher) {
        publisherId = await getOrgIdFromAutocompleteChoice(dataset.publisher);
        setState((state) => ({
            ...state,
            dataset: {
                ...state.dataset,
                publisher: {
                    name: (dataset.publisher as any).name,
                    publisherId
                }
            }
        }));
    }

    const inputDataset = {
        id: datasetId,
        name: dataset.title,
        aspects: {
            publishing: getPublishingAspectData(state),
            "dcat-dataset-strings": buildDcatDatasetStrings(dataset),
            "spatial-coverage": spatialCoverage,
            "temporal-coverage": temporalCoverage,
            "dataset-distributions": {
                distributions: distributionRecords.map((d) => d.id)
            },
            access: datasetAccess,
            "information-security": informationSecurity,
            "access-control": getAccessControlAspectData(state),
            currency: {
                ...currency,
                supersededBy:
                    currency.status === "SUPERSEDED"
                        ? await preProcessDatasetAutocompleteChoices(
                              state,
                              currency.supersededBy
                          )
                        : undefined,
                retireReason:
                    currency.status === "RETIRED"
                        ? currency.retireReason
                        : undefined
            },
            provenance: {
                mechanism: provenance.mechanism,
                sourceSystem: provenance.sourceSystem,
                derivedFrom: await preProcessDatasetAutocompleteChoices(
                    state,
                    provenance.derivedFrom
                ),
                affiliatedOrganizationIds:
                    provenance.affiliatedOrganizations &&
                    (await Promise.all(
                        provenance.affiliatedOrganizations.map((org) =>
                            getOrgIdFromAutocompleteChoice(org)
                        )
                    )),
                isOpenData: provenance.isOpenData
            },
            "dataset-publisher": publisherId && {
                publisher: publisherId
            },
            // --- set dataset initial version
            version: state?.version
                ? state.version
                : getInitialVersionAspectData(
                      state.dataset.title,
                      state.dataset.editingUserId
                  )
        }
    };

    if (!isUpdate) {
        inputDataset.aspects["source"] = getInternalDatasetSourceAspectData();
    }

    return inputDataset;
}

async function convertStateToDistributionRecords(state: State) {
    const { dataset, distributions, licenseLevel } = state;

    const distributionRecords = distributions.map((distribution) => {
        const aspect =
            licenseLevel === "dataset"
                ? {
                      ...distribution,
                      license: dataset.defaultLicense
                  }
                : distribution;

        // --- version property should be created as a separate version aspect
        // --- rather than part of `dcat-distribution-strings`
        aspect.version = undefined;

        return {
            id: distribution.id ? distribution.id : createId("dist"),
            name: distribution.title,
            aspects: {
                "dcat-distribution-strings": aspect,
                "access-control": getAccessControlAspectData(state),
                "information-security": state.informationSecurity,
                publishing: getPublishingAspectData(state),
                source: getInternalDatasetSourceAspectData(),
                // --- set distribution initial version if not exist
                // --- the version will be bumped when it's superseded by a new file / distribution
                version: distribution?.version
                    ? distribution.version
                    : getInitialVersionAspectData(
                          distribution.title,
                          state.dataset.editingUserId,
                          distribution.useStorageApi
                              ? distribution.downloadURL
                              : undefined
                      )
            }
        };
    });

    return distributionRecords;
}

/**
 * Update ckan export aspect status acccording to UI status.
 * We use JSON Patch request to avoid edging cases.
 * Without using patch API, all content of the `export aspect` will always be replaced and all fields (including important backend runtime fields) will also be overwritten.
 * If during this time (between the last time of UI retrieving the `export aspect data` and the time when the export aspect update request sent by UI arrives at registry api), backend minion updates some the important runtime fields.
 * Those fields' value will be overwritten with outdated value.
 *
 * @param {string} datasetId
 * @param {State} state
 */
async function updateCkanExportStatus(datasetId: string, state: State) {
    // Please note: any frontend code should ONLY (and should ONLY NEED to) change those two fields:
    // - status: Those two fields should ONLY been updated via patch request. Otherwise, other runtime fields may lose value.
    // - exportRequired: Those two fields should ONLY been updated via patch request. Otherwise, other runtime fields may lose value.

    // Other fields are all runtime status fields that are only allowed to be altered by minions.
    // Any attempts to update those from frontend will more or less create edging cases (see comment above).

    const exportDataPointer = `/aspects/ckan-export/${escapeJsonPatchPointer(
        config.defaultCkanServer
    )}`;

    const uiStatus = state?.datasetPublishing?.publishAsOpenData?.dga
        ? true
        : false;

    await ensureAspectExists("ckan-export");

    // Here is a trick based my tests on the [JsonPatch implementation](https://github.com/gnieh/diffson) used in our scala code base:
    // `add` operation will always work (as long as the aspect exists).
    // If the field is already there, `add` will just `replace` the value
    try {
        await patchRecord(datasetId, [
            {
                op: "add",
                path: `${exportDataPointer}/status`,
                value: uiStatus ? "retain" : "withdraw"
            },
            {
                op: "add",
                path: `${exportDataPointer}/exportRequired`,
                value: true
            }
        ]);
    } catch (e) {
        if (e instanceof ServerError && e.statusCode === 400) {
            // 400 means Bad request. Only chance it could happend would be aspect doesn't exist at all
            // we will create aspect instead
            // Update Record Aspect API will actually create the aspect when it doesn't exist
            await updateRecordAspect(datasetId, "ckan-export", {
                [config.defaultCkanServer]: {
                    status: uiStatus ? "retain" : "withdraw",
                    exportRequired: true
                }
            });
        } else {
            throw e;
        }
    }
}

export async function createDatasetFromState(
    datasetId: string,
    state: State,
    setState: React.Dispatch<React.SetStateAction<State>>,
    tagVersion: boolean = false
) {
    const distributionRecords = await convertStateToDistributionRecords(state);

    const datasetRecord = await convertStateToDatasetRecord(
        datasetId,
        distributionRecords,
        state,
        setState,
        false
    );

    return await createDataset(datasetRecord, distributionRecords, tagVersion);
}

export async function updateDatasetFromState(
    datasetId: string,
    state: State,
    setState: React.Dispatch<React.SetStateAction<State>>,
    tagVersion: boolean = false
) {
    const distributionRecords = await convertStateToDistributionRecords(state);
    const datasetRecord = await convertStateToDatasetRecord(
        datasetId,
        distributionRecords,
        state,
        setState,
        true
    );
    return await updateDataset(datasetRecord, distributionRecords, tagVersion);
}

type FailedFileInfo = {
    id?: string;
    title: string;
};

/**
 * Tried to delete any uploaded files that is not associated with any distributions (this also include any files associated with distribution versions).
 * Return info of files that are failed to delete.
 * If all files are deleted successfully or no files are required to deleted, it will return an empty array.
 *
 * @export
 * @param {string[]} uploadedFileUrls a list of all files have been uploaded to internal magda storage API. Can be retrieved from state.uploadedFileUrls
 * @param {Distribution[]} distributions all dataset's dsitributions. Can be retrieved from state.distributions
 * @returns {Promise<FailedFileInfo[]>}
 */
export async function cleanUpOrphanFiles(
    uploadedFileUrls: string[],
    distributions: Distribution[]
): Promise<FailedFileInfo[]> {
    let distOwnedFiles: string[] = [];

    distributions.forEach((dist) => {
        if (dist.useStorageApi && dist.downloadURL) {
            distOwnedFiles.push(dist.downloadURL);
        }
        if (dist?.version?.versions?.length) {
            dist.version.versions.forEach((ver) => {
                if (ver.internalDataFileUrl) {
                    distOwnedFiles.push(ver.internalDataFileUrl);
                }
            });
        }
    });

    distOwnedFiles = uniq(distOwnedFiles);

    return (
        await Promise.all(
            uploadedFileUrls.map(async (fileUrl) => {
                if (distOwnedFiles.indexOf(fileUrl) !== -1) {
                    // --- do nothing if the url is allocated to a distribution
                    return { isOk: true };
                }

                let distId, fileName;

                try {
                    const result = getDistInfoFromDownloadUrl(fileUrl);
                    fileName = result.fileName;
                } catch (e) {
                    return { title: fileUrl, isOk: false };
                }

                try {
                    await deleteFile({
                        title: fileName,
                        downloadURL: fileUrl
                    } as Distribution);

                    return { isOk: true };
                } catch (e) {
                    console.error(e);
                    return { id: distId, title: fileName, isOk: false };
                }
            })
        )
    ).filter((item) => !item.isOk) as FailedFileInfo[];
}

async function cleanUpDistributions(state: State) {
    const { involvedDistributionIds, distributions } = state;

    if (!involvedDistributionIds?.length) {
        return;
    }

    const deletedDistIds = involvedDistributionIds.filter(
        (id) => distributions.findIndex((dist) => dist.id === id) === -1
    );

    if (!deletedDistIds?.length) {
        return;
    }

    for (let i = 0; i < deletedDistIds.length; i++) {
        await deleteRecord(deletedDistIds[i]);
    }
}

function createVersionForDatasetSubmission(
    eventId: number,
    datasetData: RawDataset,
    state: State
) {
    const editorId = state.dataset.editingUserId;
    // --- check if a new version is required to create for the dataset's submission
    const version: VersionAspectData = datasetData.aspects["version"]
        ? datasetData.aspects["version"]
        : getInitialVersionAspectData(state.dataset.title, editorId);

    let currentVersion: VersionItem | undefined = version.versions.find(
        (ver) => ver.versionNumber === version.currentVersionNumber
    );
    if (
        !currentVersion ||
        (currentVersion.eventId && currentVersion.eventId !== eventId)
    ) {
        currentVersion = {
            versionNumber:
                version.versions.reduce(
                    (acc, curVer) => Math.max(acc, curVer.versionNumber),
                    0
                ) + 1,
            createTime: new Date().toISOString(),
            creatorId: editorId,
            title: state.dataset.title,
            description: "Version created on update submission"
        };
        version.versions.push(currentVersion);
        version.currentVersionNumber = currentVersion.versionNumber;
    }
    datasetData.aspects["version"] = version;
    return datasetData;
}

/**
 * This function will submit the dataset using different API endpoints (depends on whether the dataset has been create or not)
 * It will also delete any temporary draft data from the `dataset-draft` aspect.
 *
 * @export
 * @param {string} datasetId
 * @param {State} state
 * @param {React.Dispatch<React.SetStateAction<State>>} setState
 */
export async function submitDatasetFromState(
    datasetId: string,
    state: State,
    setState: React.Dispatch<React.SetStateAction<State>>
): Promise<FailedFileInfo[]> {
    let datasetData: Record, eventId: number;
    if (await doesRecordExist(datasetId)) {
        [datasetData, eventId] = await updateDatasetFromState(
            datasetId,
            state,
            setState,
            true
        );
    } else {
        [datasetData, eventId] = await createDatasetFromState(
            datasetId,
            state,
            setState,
            true
        );
    }

    const [, draftDetetionEventId] = await deleteRecordAspect(
        datasetId,
        "dataset-draft"
    );

    const lastEventId = Math.max(draftDetetionEventId, eventId);

    // --- attempt to create a new version for dataset submission when necessary
    datasetData = createVersionForDatasetSubmission(
        lastEventId,
        datasetData as RawDataset,
        state
    );

    // --- attempt to tag dataset version
    await tagRecordVersionEventId(datasetData, lastEventId);

    await updateCkanExportStatus(datasetId, state);

    await cleanUpDistributions(state);

    const failedFileInfo = await cleanUpOrphanFiles(
        state.uploadedFileUrls,
        state.distributions
    );

    try {
        const indexResult = await indexDatasetById(datasetId);
        if (indexResult?.failureReasons?.length) {
            console.error(
                `Failed to index dataset ${datasetId}: `,
                indexResult
            );
            throw new ServerError(
                `Failed to index dataset ${datasetId} for search engine: ${indexResult.failureReasons.join(
                    "; "
                )}`,
                500
            );
        } else if (indexResult?.warnReasons?.length) {
            console.warn(
                `Warnings when index dataset ${datasetId}: `,
                indexResult
            );
        }
    } catch (e) {
        if (e instanceof Error) {
            e.message = `Failed to index dataset ${datasetId} for search engine: ${e.message}`;
        }
        console.error(
            `Failed to index dataset ${datasetId} for search engine: `,
            e
        );
        throw e;
    }

    return failedFileInfo;
}

export async function deleteFileByUrl(
    fileUrl: string
): Promise<{ title: string; id?: string; error: string } | undefined> {
    let distId, fileName;

    try {
        const result = getDistInfoFromDownloadUrl(fileUrl);
        fileName = result.fileName;
    } catch (e) {
        return { title: fileUrl, error: "" + e };
    }

    try {
        await deleteFile({
            title: fileName,
            downloadURL: fileUrl
        } as Distribution);
        return undefined;
    } catch (e) {
        console.error(e);
        return { id: distId, title: fileName, error: "" + e };
    }
}

export type FileOperationFailureReasonType = {
    id?: string;
    title: string;
    error: string;
};

export type DatasetDeletionResultType = {
    hasError: boolean;
    deletedFiles: string[];
    failedDeletedFiles: string[];
    failureReasons: FileOperationFailureReasonType[];
};

export async function deleteDataset(
    datasetId: string
): Promise<DatasetDeletionResultType> {
    const deletedFiles: string[] = [];
    const failedDeletedFiles: string[] = [];
    const failureReasons: FileOperationFailureReasonType[] = [];

    const datasetStateData = await loadStateFromRegistry(datasetId, {} as User);
    let datasetData: RawDataset;
    try {
        datasetData = await fetchRecordWithNoCache(datasetId, [
            "dcat-distribution-strings",
            "dataset-distributions",
            "version"
        ]);
    } catch (e) {
        if (e instanceof ServerError && e.statusCode === 404) {
            return {
                hasError: false,
                deletedFiles,
                failedDeletedFiles,
                failureReasons
            };
        } else {
            throw e;
        }
    }

    const distributions = datasetData.aspects[
        "distributions"
    ] as RawDistribution[];

    if (distributions?.length) {
        for (const dist of distributions) {
            const distInfo = dist.aspects["dcat-distribution-strings"];
            const version = dist.aspects["version"];
            if (distInfo?.useStorageApi && distInfo?.downloadURL) {
                if (
                    deletedFiles
                        .concat(failedDeletedFiles)
                        .indexOf(distInfo.downloadURL) === -1
                ) {
                    const result = await deleteFileByUrl(distInfo.downloadURL);
                    if (result) {
                        failureReasons.push(result);
                        failedDeletedFiles.push(distInfo.downloadURL);
                    } else {
                        deletedFiles.push(distInfo.downloadURL);
                    }
                }
            }
            if (version?.versions?.length) {
                for (const versionInfo of version.versions) {
                    if (
                        versionInfo?.internalDataFileUrl &&
                        deletedFiles
                            .concat(failedDeletedFiles)
                            .indexOf(versionInfo.internalDataFileUrl) === -1
                    ) {
                        const result = await deleteFileByUrl(
                            versionInfo.internalDataFileUrl
                        );
                        if (result) {
                            failureReasons.push(result);
                            failedDeletedFiles.push(
                                versionInfo.internalDataFileUrl
                            );
                        } else {
                            deletedFiles.push(versionInfo.internalDataFileUrl);
                        }
                    }
                }
            }
            await deleteRecord(dist.id);
        }
    }

    if (datasetStateData?.uploadedFileUrls?.length) {
        for (const fileUrl of datasetStateData.uploadedFileUrls) {
            if (
                deletedFiles.concat(failedDeletedFiles).indexOf(fileUrl) === -1
            ) {
                const result = await deleteFileByUrl(fileUrl);
                if (result) {
                    failureReasons.push(result);
                    failedDeletedFiles.push(fileUrl);
                } else {
                    deletedFiles.push(fileUrl);
                }
            }
        }
    }

    await deleteDatasetIndexById(datasetId);
    await deleteRecord(datasetId);

    return {
        hasError: failedDeletedFiles?.length ? true : false,
        deletedFiles,
        failedDeletedFiles,
        failureReasons
    };
}
