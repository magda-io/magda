import uuidv4 from "uuid/v4";

import { ContactPointDisplayOption } from "constants/DatasetConstants";
import {
    fetchOrganization,
    fetchRecord,
    createDataset,
    ensureAspectExists,
    createPublisher,
    updateDataset,
    Record
} from "api-clients/RegistryApis";
import { config } from "config";
import { User } from "reducers/userManagementReducer";
import { RawDataset } from "helpers/record";

import { autocompletePublishers } from "api-clients/SearchApis";

import datasetPublishingAspect from "@magda/registry-aspects/publishing.schema.json";
import dcatDatasetStringsAspect from "@magda/registry-aspects/dcat-dataset-strings.schema.json";
import spatialCoverageAspect from "@magda/registry-aspects/spatial-coverage.schema.json";
import temporalCoverageAspect from "@magda/registry-aspects/temporal-coverage.schema.json";
import datasetDistributionsAspect from "@magda/registry-aspects/dataset-distributions.schema.json";
import dcatDistributionStringsAspect from "@magda/registry-aspects/dcat-distribution-strings.schema.json";
import accessAspect from "@magda/registry-aspects/access.schema.json";
import provenanceAspect from "@magda/registry-aspects/provenance.schema.json";
import informationSecurityAspect from "@magda/registry-aspects/information-security.schema.json";
import datasetAccessControlAspect from "@magda/registry-aspects/dataset-access-control.schema.json";
import organizationDetailsAspect from "@magda/registry-aspects/organization-details.schema.json";
import datasetPublisherAspect from "@magda/registry-aspects/dataset-publisher.schema.json";
import currencyAspect from "@magda/registry-aspects/currency.schema.json";
import ckanPublishAspect from "@magda/registry-aspects/ckan-publish.schema.json";
import sourceAspect from "@magda/registry-aspects/source.schema.json";

const aspects = {
    publishing: datasetPublishingAspect,
    "dcat-dataset-strings": dcatDatasetStringsAspect,
    "spatial-coverage": spatialCoverageAspect,
    "temporal-coverage": temporalCoverageAspect,
    "dataset-distributions": datasetDistributionsAspect,
    "dcat-distribution-strings": dcatDistributionStringsAspect,
    access: accessAspect,
    provenance: provenanceAspect,
    "information-security": informationSecurityAspect,
    "dataset-access-control": datasetAccessControlAspect,
    "dataset-publisher": datasetPublisherAspect,
    currency: currencyAspect,
    "ckan-publish": ckanPublishAspect,
    source: sourceAspect
};

export type Distribution = {
    title: string;
    description?: string;
    issued?: string;
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
    temporalCoverage?: any;
    spatialCoverage?: any;

    similarFingerprint?: any;
    equalHash?: string;

    // --- An UUID for identify a file during the processing. array index is not a reliable id.
    id?: string;
    creationSource?: DistributionSource;
    creationMethod?: DistributionCreationMethod;
    _state: DistributionState;
    _progress?: number;
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
    Drafting
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
    owningOrgUnitId?: string;
    custodianOrgUnitId?: string;
    contactPointDisplay?: string;
    landingPage?: string;
    importance?: string;
    accessLevel?: string;
    accessNotesTemp?: string;
};

export type Provenance = {
    mechanism?: string;
    sourceSystem?: string;
    derivedFrom?: DatasetAutocompleteChoice[];
    affiliatedOrganizations?: OrganisationAutocompleteChoice[];
    isOpenData?: boolean;
};

export type DatasetPublishing = {
    state: string;
    level: string;
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

type CkanPublishStatus = "withdraw" | "retain";
type CkanPublish = {
    status: CkanPublishStatus;
    hasCreated: boolean;
    publishRequired: boolean;
    publishAttempted: boolean;
    publishUserId?: string;
    ckanId?: string;
    lastPublishAttemptTime?: Date;
    publishError?: Error | string;
};

export type State = {
    distributions: Distribution[];
    dataset: Dataset;
    datasetPublishing: DatasetPublishing;
    processing: boolean;
    spatialCoverage: SpatialCoverage;
    temporalCoverage: TemporalCoverage;
    datasetAccess: Access;
    informationSecurity: InformationSecurity;
    provenance: Provenance;
    currency: Currency;
    ckanPublish: CkanPublish;

    _lastModifiedDate: Date;
    _createdDate: Date;

    licenseLevel: "dataset" | "distribution";

    shouldUploadToStorageApi: boolean;

    isPublishing: boolean;
    error: Error | null;
};

type TemporalCoverage = {
    intervals: Interval[];
};

export type Interval = {
    start?: Date;
    end?: Date;
};

type Access = {
    location?: string;
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

    if (data.aspects?.["dataset-access-control"]?.orgUnitOwnerId) {
        state.dataset.owningOrgUnitId =
            data.aspects?.["dataset-access-control"]?.orgUnitOwnerId;
    }

    if (data.aspects?.["dataset-access-control"]?.custodianOrgUnitId) {
        state.dataset.custodianOrgUnitId =
            data.aspects?.["dataset-access-control"]?.custodianOrgUnitId;
    }
}

function populateDatasetPublisherAspect(data: RawDataset, state: State) {
    const publisher = data.aspects?.["dataset-publisher"]?.publisher;

    if (publisher) {
        state.dataset.publisher = {
            name: publisher.name,
            existingId: publisher.id
        };
    }
}

function populateTemporalCoverageAspect(data: RawDataset, state: State) {
    if (!data.aspects?.["temporal-coverage"]?.intervals?.length) {
        return;
    }
    const intervals = data.aspects["temporal-coverage"].intervals
        .map(item => ({
            start: dateStringToDate(item.start),
            end: dateStringToDate(item.end)
        }))
        .filter(item => item.start || item.end);

    if (intervals.length) {
        state.temporalCoverage = {
            intervals: intervals as Interval[]
        };
    }
}

async function getDatasetNameById(id): Promise<string> {
    try {
        const data = await fetchRecord(id, ["dcat-dataset-strings"], []);
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
            item => ({
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
        .filter(item => item?.aspects?.["dcat-distribution-strings"])
        .map(item => {
            const modified = dateStringToDate(
                item.aspects["dcat-distribution-strings"].modified
            );
            const dis = {
                ...item.aspects["dcat-distribution-strings"],
                id: item.id,
                modified: modified ? modified : new Date(),
                _state: DistributionState.Ready
            };
            return dis;
        });
    if (distributions.length) {
        state.distributions = distributions;
    }
}

export async function rawDatasetDataToState(data: RawDataset): Promise<State> {
    const state = createBlankState();

    populateDcatDatasetStringAspect(data, state);
    populateDatasetPublisherAspect(data, state);

    if (data.aspects?.["publishing"]) {
        state.datasetPublishing = data.aspects?.["publishing"];
    }

    if (data.aspects?.["spatial-coverage"]) {
        state.spatialCoverage = data.aspects?.["spatial-coverage"];
    }

    if (data.aspects?.["ckan-publish"]) {
        state.ckanPublish = data.aspects?.["ckan-publish"];
    }

    populateTemporalCoverageAspect(data, state);

    if (data.aspects?.["access"]?.location || data.aspects?.["access"]?.note) {
        state.datasetAccess = data.aspects?.["access"];
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

    return state;
}

export function createBlankState(user?: User): State {
    return {
        distributions: [],
        processing: false,
        dataset: {
            title: "",
            languages: ["eng"],
            owningOrgUnitId: user ? user.orgUnitId : undefined,
            defaultLicense: "world"
        },
        datasetPublishing: {
            state: "draft",
            level: "agency",
            contactPointDisplay: "team"
        },
        spatialCoverage: {
            // Australia, Mainland
            lv1Id: "1",
            bbox: [
                109.951171875,
                -45.398449976304086,
                155.0390625,
                -9.172601695217201
            ],
            spatialDataInputMethod: "region"
        },
        temporalCoverage: {
            intervals: []
        },
        datasetAccess: {},
        informationSecurity: {},
        provenance: {},
        currency: {
            status: "CURRENT"
        },
        licenseLevel: "dataset",
        isPublishing: false,
        shouldUploadToStorageApi: false,
        error: null,
        _createdDate: new Date(),
        _lastModifiedDate: new Date(),
        ckanPublish: {
            status: "withdraw",
            hasCreated: false,
            publishAttempted: false,
            publishRequired: false
        }
    };
}

// saving data in the local storage for now
// TODO: consider whether it makes sense to store this in registry as a custom state or something
export async function loadState(id: string, user?: User): Promise<State> {
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
        const org = await fetchOrganization(config.defaultOrganizationId);
        state.dataset.publisher = {
            name: org.name,
            existingId: org.id
        };
    }

    return state;
}

export function saveState(state: State, id = createId()) {
    state = Object.assign({}, state);

    state._lastModifiedDate = new Date();
    const dataset = JSON.stringify(state);
    localStorage[id] = dataset;
    return id;
}

export function createId(type = "ds") {
    return `magda-${type}-${uuidv4()}`;
}

async function ensureBlankDatasetIsSavedToRegistry(
    state: State,
    id: string,
    name: string
) {
    try {
        await fetchRecord(id, [], [], false);
    } catch (e) {
        if (e.statusCode !== 404) {
            throw e;
        }
        const { dataset, datasetPublishing } = state;
        // --- if the dataset not exist in registry, save it now
        // --- the dataset should have the same visibility as the current one
        // --- but always be a draft one
        await createDataset(
            {
                id,
                name,
                aspects: {
                    publishing: {
                        ...datasetPublishing,
                        state: "draft",
                        publishAsOpenData: {}
                    },
                    "dataset-access-control": {
                        orgUnitOwnerId: dataset.owningOrgUnitId
                            ? dataset.owningOrgUnitId
                            : undefined,
                        custodianOrgUnitId: dataset.custodianOrgUnitId
                            ? dataset.custodianOrgUnitId
                            : undefined
                    },
                    source: getInternalDatasetSourceAspectData()
                }
            },
            [],
            {
                publishing: datasetPublishingAspect,
                "dataset-access-control": datasetAccessControlAspect,
                source: sourceAspect
            }
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
        title: value.title,
        description: value.description,
        issued: value.issued && value.issued.toISOString(),
        modified: value.modified && value.modified.toISOString(),
        languages: value.languages,
        publisher: value.publisher && value.publisher.name,
        accrualPeriodicity: value.accrualPeriodicity,
        accrualPeriodicityRecurrenceRule:
            value.accrualPeriodicityRecurrenceRule,
        themes: value.themes && value.themes.keywords,
        keywords: value.keywords && value.keywords.keywords,
        defaultLicense: value.defaultLicense
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
            publisher =>
                publisher.value.toLowerCase().trim() ===
                organization!.name.toLowerCase().trim()
        );

        if (!match) {
            // OK no publisher, lets add it
            await ensureAspectExists(
                "organization-details",
                organizationDetailsAspect
            );

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
) {
    const {
        dataset,
        datasetPublishing,
        spatialCoverage,
        temporalCoverage,
        informationSecurity,
        datasetAccess,
        provenance,
        currency,
        ckanPublish
    } = state;

    let publisherId;
    if (dataset.publisher) {
        publisherId = await getOrgIdFromAutocompleteChoice(dataset.publisher);
        setState(state => ({
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
            publishing: datasetPublishing,
            "dcat-dataset-strings": buildDcatDatasetStrings(dataset),
            "spatial-coverage": spatialCoverage,
            "temporal-coverage": temporalCoverage,
            "dataset-distributions": {
                distributions: distributionRecords.map(d => d.id)
            },
            "ckan-publish": ckanPublish,
            access: datasetAccess,
            "information-security": informationSecurity,
            "dataset-access-control": {
                orgUnitOwnerId: dataset.owningOrgUnitId
                    ? dataset.owningOrgUnitId
                    : undefined,
                custodianOrgUnitId: dataset.custodianOrgUnitId
                    ? dataset.custodianOrgUnitId
                    : undefined
            },
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
                        provenance.affiliatedOrganizations.map(org =>
                            getOrgIdFromAutocompleteChoice(org)
                        )
                    )),
                isOpenData: provenance.isOpenData
            },
            "dataset-publisher": publisherId && {
                publisher: publisherId
            }
        }
    };

    if (!isUpdate) {
        inputDataset.aspects["source"] = getInternalDatasetSourceAspectData();
    }

    if (!inputDataset.aspects["dataset-access-control"].orgUnitOwnerId) {
        delete inputDataset.aspects["dataset-access-control"];
    }

    return inputDataset;
}

async function convertStateToDistributionRecords(state: State) {
    const { dataset, distributions, licenseLevel } = state;

    const distributionRecords = distributions.map(distribution => {
        const aspect =
            licenseLevel === "dataset"
                ? {
                      ...distribution,
                      license: dataset.defaultLicense
                  }
                : distribution;

        return {
            id: distribution.id ? distribution.id : createId("dist"),
            name: distribution.title,
            aspects: {
                "dcat-distribution-strings": aspect
            }
        };
    });

    return distributionRecords;
}

export async function createDatasetFromState(
    datasetId: string,
    state: State,
    setState: React.Dispatch<React.SetStateAction<State>>
) {
    if (state.datasetPublishing.publishAsOpenData?.dga) {
        state.ckanPublish.status = "retain";
        state.ckanPublish.publishRequired = true;
    } else {
        state.ckanPublish.status = "withdraw";
        state.ckanPublish.publishRequired = false;
    }

    const distributionRecords = await convertStateToDistributionRecords(state);
    const datasetRecord = await convertStateToDatasetRecord(
        datasetId,
        distributionRecords,
        state,
        setState
    );
    await createDataset(datasetRecord, distributionRecords, aspects);
}

export async function updateDatasetFromState(
    datasetId: string,
    state: State,
    setState: React.Dispatch<React.SetStateAction<State>>
) {
    // If the dataset has been published, do an update in CKAN
    if (
        state.ckanPublish.status === "retain" &&
        state.ckanPublish.publishAttempted
    ) {
        state.ckanPublish.publishRequired = true;
    }
    const distributionRecords = await convertStateToDistributionRecords(state);
    const datasetRecord = await convertStateToDatasetRecord(
        datasetId,
        distributionRecords,
        state,
        setState,
        true
    );
    await updateDataset(datasetRecord, distributionRecords, aspects);
}
